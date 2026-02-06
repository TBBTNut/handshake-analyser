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
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  const [showFilterModal, setShowFilterModal] = useState(false);
  
  // Filter states
  const [searchText, setSearchText] = useState('');
  const [filterProtocol, setFilterProtocol] = useState<string>('');
  const [filterMode, setFilterMode] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  
  // Audio playback states
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [loadingAudio, setLoadingAudio] = useState(false);
  
  // Download states
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  
  // Download queue states
  const [downloadQueue, setDownloadQueue] = useState<Map<string, {
    sessionId: string;
    url: string;
    progress: number;
    status: 'queued' | 'downloading' | 'complete' | 'failed' | 'cancelled';
    resumable?: any;
    retryCount?: number;
  }>>(new Map());
  const [showQueueModal, setShowQueueModal] = useState(false);
  
  // Theme state
  const [theme, setTheme] = useState<'terminal' | 'windows95'>('terminal');

  useEffect(() => {
    loadHistory();
    setupAudio();
    loadTheme();
    
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('app_theme');
      if (savedTheme === 'windows95' || savedTheme === 'terminal') {
        setTheme(savedTheme);
      }
    } catch (error) {
      console.error('Error loading theme:', error);
    }
  };

  const saveTheme = async (newTheme: 'terminal' | 'windows95') => {
    try {
      await AsyncStorage.setItem('app_theme', newTheme);
      setTheme(newTheme);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

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

  const loadHistory = async () => {
    try {
      const params = new URLSearchParams();
      params.append('limit', '100');
      
      if (filterProtocol) params.append('protocol', filterProtocol);
      if (filterMode) params.append('mode', filterMode);
      if (filterStatus) params.append('status', filterStatus);
      if (searchText) params.append('search', searchText);
      
      const response = await axios.get(`${BACKEND_URL}/api/history?${params.toString()}`);
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
  }, [searchText, filterProtocol, filterMode, filterStatus]);

  const applyFilters = () => {
    setShowFilterModal(false);
    loadHistory();
  };

  const clearFilters = () => {
    setSearchText('');
    setFilterProtocol('');
    setFilterMode('');
    setFilterStatus('');
    setShowFilterModal(false);
    setTimeout(() => loadHistory(), 100);
  };

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
      
      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Share the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: format === 'json' ? 'application/json' : 'text/csv',
          dialogTitle: `Export Handshake Data (${format.toUpperCase()})`,
        });
      } else {
        Alert.alert('Success', `File saved to ${fileUri}`);
      }
    } catch (error: any) {
      console.error('Error exporting handshake:', error);
      Alert.alert('Error', 'Failed to export handshake data');
    }
  };

  const playRecording = async (recordingUrl: string) => {
    try {
      setLoadingAudio(true);
      
      // Unload previous sound if exists
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }

      // Load and play the recording
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: recordingUrl },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );
      
      setSound(newSound);
      setIsPlaying(true);
      setLoadingAudio(false);
    } catch (error) {
      console.error('Error playing recording:', error);
      Alert.alert('Error', 'Failed to play recording');
      setLoadingAudio(false);
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPlaybackPosition(status.positionMillis);
      setPlaybackDuration(status.durationMillis);
      setIsPlaying(status.isPlaying);
      
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPlaybackPosition(0);
      }
    }
  };

  const togglePlayPause = async () => {
    if (!sound) return;
    
    try {
      if (isPlaying) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
    }
  };

  const seekAudio = async (value: number) => {
    if (!sound) return;
    
    try {
      await sound.setPositionAsync(value);
    } catch (error) {
      console.error('Error seeking audio:', error);
    }
  };

  const stopAudio = async () => {
    if (!sound) return;
    
    try {
      await sound.stopAsync();
      await sound.unloadAsync();
      setSound(null);
      setIsPlaying(false);
      setPlaybackPosition(0);
      setPlaybackDuration(0);
    } catch (error) {
      console.error('Error stopping audio:', error);
    }
  };

  const downloadRecording = async (recordingUrl: string, sessionId: string) => {
    try {
      // Check if already in queue
      if (downloadQueue.has(sessionId)) {
        Alert.alert('Already Downloading', 'This recording is already in the download queue');
        return;
      }

      // Add to queue
      const newQueue = new Map(downloadQueue);
      newQueue.set(sessionId, {
        sessionId,
        url: recordingUrl,
        progress: 0,
        status: 'queued',
      });
      setDownloadQueue(newQueue);
      setShowQueueModal(true);

      // Start download
      await processDownload(sessionId, recordingUrl);
    } catch (error: any) {
      console.error('Error adding to download queue:', error);
      Alert.alert('Error', 'Failed to add recording to download queue');
    }
  };

  const processDownload = async (sessionId: string, recordingUrl: string) => {
    try {
      // Update status to downloading
      updateQueueItem(sessionId, { status: 'downloading', progress: 0 });

      const timestamp = new Date().getTime();
      const fileName = `recording_${sessionId}_${timestamp}.mp3`;
      const fileUri = FileSystem.documentDirectory + fileName;

      // Create download resumable
      const downloadResumable = FileSystem.createDownloadResumable(
        recordingUrl,
        fileUri,
        {},
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          updateQueueItem(sessionId, { progress });
        }
      );

      // Store resumable for cancellation
      updateQueueItem(sessionId, { resumable: downloadResumable });

      const result = await downloadResumable.downloadAsync();
      
      if (result) {
        // Update status to complete
        updateQueueItem(sessionId, { status: 'complete', progress: 1 });
        
        // Show completion notification
        Alert.alert(
          'Download Complete',
          `Recording saved to:\n${result.uri}`,
          [
            { text: 'OK', style: 'default' },
            {
              text: 'Share',
              onPress: async () => {
                if (await Sharing.isAvailableAsync()) {
                  await Sharing.shareAsync(result.uri, {
                    mimeType: 'audio/mpeg',
                    dialogTitle: 'Share Recording',
                  });
                }
              },
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('Error downloading recording:', error);
      updateQueueItem(sessionId, { status: 'failed', progress: 0 });
      Alert.alert('Download Failed', error.message || 'Failed to download recording');
    }
  };

  const updateQueueItem = (sessionId: string, updates: Partial<any>) => {
    setDownloadQueue((prev) => {
      const newQueue = new Map(prev);
      const item = newQueue.get(sessionId);
      if (item) {
        newQueue.set(sessionId, { ...item, ...updates });
      }
      return newQueue;
    });
  };

  const cancelDownload = async (sessionId: string) => {
    const item = downloadQueue.get(sessionId);
    if (!item) return;

    try {
      if (item.resumable && item.status === 'downloading') {
        await item.resumable.pauseAsync();
      }
      updateQueueItem(sessionId, { status: 'cancelled', progress: 0 });
      
      // Remove from queue after a delay
      setTimeout(() => {
        setDownloadQueue((prev) => {
          const newQueue = new Map(prev);
          newQueue.delete(sessionId);
          return newQueue;
        });
      }, 2000);
    } catch (error) {
      console.error('Error cancelling download:', error);
    }
  };

  const clearCompletedDownloads = () => {
    setDownloadQueue((prev) => {
      const newQueue = new Map(prev);
      for (const [key, value] of newQueue.entries()) {
        if (value.status === 'complete' || value.status === 'failed' || value.status === 'cancelled') {
          newQueue.delete(key);
        }
      }
      return newQueue;
    });
  };

  const downloadAllRecordings = async () => {
    const recordingsToDownload = history.filter(entry => entry.recording_url);
    
    if (recordingsToDownload.length === 0) {
      Alert.alert('No Recordings', 'No recordings available to download');
      return;
    }

    Alert.alert(
      'Download All Recordings',
      `Download ${recordingsToDownload.length} recording(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: async () => {
            setShowQueueModal(true);
            
            for (const entry of recordingsToDownload) {
              // Add to queue if not already there
              if (!downloadQueue.has(entry.session_id)) {
                const newQueue = new Map(downloadQueue);
                newQueue.set(entry.session_id, {
                  sessionId: entry.session_id,
                  url: entry.recording_url!,
                  progress: 0,
                  status: 'queued',
                });
                setDownloadQueue(newQueue);
              }
            }

            // Process downloads sequentially
            for (const entry of recordingsToDownload) {
              if (!downloadQueue.has(entry.session_id) || downloadQueue.get(entry.session_id)?.status === 'queued') {
                await processDownload(entry.session_id, entry.recording_url!);
                // Small delay between downloads
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }

            Alert.alert('Success', `Downloaded ${recordingsToDownload.length} recording(s)`);
          },
        },
      ]
    );
  };

  const getQueueStatusIcon = (status: string) => {
    switch (status) {
      case 'queued':
        return 'hourglass';
      case 'downloading':
        return 'download';
      case 'complete':
        return 'checkmark-circle';
      case 'failed':
        return 'close-circle';
      case 'cancelled':
        return 'ban';
      default:
        return 'help-circle';
    }
  };

  const getQueueStatusColor = (status: string) => {
    switch (status) {
      case 'queued':
        return '#ffff00';
      case 'downloading':
        return '#00ff00';
      case 'complete':
        return '#00ff00';
      case 'failed':
        return '#ff0000';
      case 'cancelled':
        return '#888';
      default:
        return '#888';
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

  const hasActiveFilters = searchText || filterProtocol || filterMode || filterStatus;

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
          <Text style={styles.title}>HISTORY</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={downloadAllRecordings}
              style={styles.downloadAllButton}
            >
              <Ionicons name="cloud-download" size={24} color="#00ff00" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowQueueModal(true)}
              style={styles.queueButton}
            >
              <Ionicons name="list" size={24} color="#00ff00" />
              {downloadQueue.size > 0 && (
                <View style={styles.queueBadge}>
                  <Text style={styles.queueBadgeText}>{downloadQueue.size}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowFilterModal(true)}
              style={styles.filterButton}
            >
              <Ionicons name="funnel" size={24} color={hasActiveFilters ? '#00ff00' : '#888'} />
              {hasActiveFilters && <View style={styles.filterDot} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={clearAllHistory} style={styles.clearButton}>
              <Ionicons name="trash" size={24} color="#ff0000" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search ISP or phone number..."
            placeholderTextColor="#666"
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={loadHistory}
          />
          {searchText ? (
            <TouchableOpacity onPress={() => { setSearchText(''); loadHistory(); }}>
              <Ionicons name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          ) : null}
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
              <Text style={styles.emptyText}>
                {hasActiveFilters ? 'No results found' : 'No connection history yet'}
              </Text>
              <Text style={styles.emptySubtext}>
                {hasActiveFilters ? 'Try adjusting your filters' : 'Your dial attempts will appear here'}
              </Text>
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
                  
                  {entry.recording_url && (
                    <View style={styles.cardRow}>
                      <Ionicons name="mic" size={16} color="#00ff00" />
                      <Text style={styles.cardLabel}>Recording:</Text>
                      <Text style={[styles.cardValue, { color: '#00ff00' }]}>Available</Text>
                    </View>
                  )}
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

                  {entry.recording_url && (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => downloadRecording(entry.recording_url!, entry.session_id)}
                    >
                      <Ionicons name="download" size={16} color="#00ff00" />
                      <Text style={styles.actionButtonText}>Audio</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteActionButton]}
                    onPress={() => deleteEntry(entry.session_id)}
                  >
                    <Ionicons name="trash" size={16} color="#ff0000" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* Filter Modal */}
        <Modal
          visible={showFilterModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowFilterModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Filter History</Text>
                <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                  <Ionicons name="close" size={28} color="#00ff00" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll}>
                <View style={styles.filterSection}>
                  <Text style={styles.filterLabel}>PROTOCOL</Text>
                  <View style={styles.filterChips}>
                    {['', 'V.90', 'V.92', 'V.34', 'V.32bis'].map((proto) => (
                      <TouchableOpacity
                        key={proto || 'all'}
                        style={[
                          styles.filterChip,
                          filterProtocol === proto && styles.filterChipActive,
                        ]}
                        onPress={() => setFilterProtocol(proto)}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            filterProtocol === proto && styles.filterChipTextActive,
                          ]}
                        >
                          {proto || 'All'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.filterSection}>
                  <Text style={styles.filterLabel}>MODE</Text>
                  <View style={styles.filterChips}>
                    {[
                      { value: '', label: 'All' },
                      { value: 'simulator', label: 'Simulator' },
                      { value: 'real_call', label: 'Real Call' },
                    ].map((mode) => (
                      <TouchableOpacity
                        key={mode.value}
                        style={[
                          styles.filterChip,
                          filterMode === mode.value && styles.filterChipActive,
                        ]}
                        onPress={() => setFilterMode(mode.value)}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            filterMode === mode.value && styles.filterChipTextActive,
                          ]}
                        >
                          {mode.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.filterSection}>
                  <Text style={styles.filterLabel}>STATUS</Text>
                  <View style={styles.filterChips}>
                    {[
                      { value: '', label: 'All' },
                      { value: 'success', label: 'Success' },
                      { value: 'failed', label: 'Failed' },
                      { value: 'in_progress', label: 'In Progress' },
                    ].map((stat) => (
                      <TouchableOpacity
                        key={stat.value}
                        style={[
                          styles.filterChip,
                          filterStatus === stat.value && styles.filterChipActive,
                        ]}
                        onPress={() => setFilterStatus(stat.value)}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            filterStatus === stat.value && styles.filterChipTextActive,
                          ]}
                        >
                          {stat.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity style={styles.applyButton} onPress={applyFilters}>
                  <Text style={styles.applyButtonText}>APPLY FILTERS</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
                  <Text style={styles.clearFiltersButtonText}>CLEAR ALL</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Detail Modal */}
        <Modal
          visible={showDetailModal}
          transparent
          animationType="slide"
          onRequestClose={() => {
            stopAudio();
            setShowDetailModal(false);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Connection Details</Text>
                <TouchableOpacity
                  onPress={() => {
                    stopAudio();
                    setShowDetailModal(false);
                  }}
                >
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

                    {/* Audio Player */}
                    {selectedEntry.recording_url && (
                      <View style={styles.detailSection}>
                        <Text style={styles.detailSectionTitle}>CALL RECORDING</Text>
                        <View style={styles.audioPlayer}>
                          {loadingAudio ? (
                            <ActivityIndicator size="small" color="#00ff00" />
                          ) : (
                            <>
                              {!sound ? (
                                <>
                                  <TouchableOpacity
                                    style={styles.playButtonLarge}
                                    onPress={() => playRecording(selectedEntry.recording_url!)}
                                  >
                                    <Ionicons name="play" size={32} color="#000" />
                                    <Text style={styles.playButtonText}>Play Recording</Text>
                                  </TouchableOpacity>
                                  
                                  <TouchableOpacity
                                    style={styles.downloadButton}
                                    onPress={() => downloadRecording(selectedEntry.recording_url!, selectedEntry.session_id)}
                                    disabled={downloading}
                                  >
                                    {downloading ? (
                                      <>
                                        <ActivityIndicator size="small" color="#00ff00" />
                                        <Text style={styles.downloadButtonText}>
                                          Downloading {Math.round(downloadProgress * 100)}%
                                        </Text>
                                      </>
                                    ) : (
                                      <>
                                        <Ionicons name="download" size={24} color="#00ff00" />
                                        <Text style={styles.downloadButtonText}>Download Recording</Text>
                                      </>
                                    )}
                                  </TouchableOpacity>
                                </>
                              ) : (
                                <>
                                  <View style={styles.audioControls}>
                                    <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
                                      <Ionicons
                                        name={isPlaying ? 'pause' : 'play'}
                                        size={24}
                                        color="#00ff00"
                                      />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={stopAudio} style={styles.stopButton}>
                                      <Ionicons name="stop" size={24} color="#ff0000" />
                                    </TouchableOpacity>
                                  </View>
                                  <Slider
                                    style={styles.slider}
                                    minimumValue={0}
                                    maximumValue={playbackDuration}
                                    value={playbackPosition}
                                    onSlidingComplete={seekAudio}
                                    minimumTrackTintColor="#00ff00"
                                    maximumTrackTintColor="#333"
                                    thumbTintColor="#00ff00"
                                  />
                                  <View style={styles.timeContainer}>
                                    <Text style={styles.timeText}>
                                      {Math.floor(playbackPosition / 1000)}s
                                    </Text>
                                    <Text style={styles.timeText}>
                                      {Math.floor(playbackDuration / 1000)}s
                                    </Text>
                                  </View>
                                </>
                              )}
                            </>
                          )}
                        </View>
                      </View>
                    )}

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

        {/* Download Queue Modal */}
        <Modal
          visible={showQueueModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowQueueModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Download Queue ({downloadQueue.size})</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity onPress={clearCompletedDownloads}>
                    <Ionicons name="checkmark-done" size={24} color="#00ff00" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowQueueModal(false)}>
                    <Ionicons name="close" size={28} color="#00ff00" />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView style={styles.modalScroll}>
                {downloadQueue.size === 0 ? (
                  <View style={styles.emptyQueueContainer}>
                    <Ionicons name="cloud-download-outline" size={64} color="#333" />
                    <Text style={styles.emptyQueueText}>No downloads in queue</Text>
                    <Text style={styles.emptyQueueSubtext}>Downloads will appear here</Text>
                  </View>
                ) : (
                  Array.from(downloadQueue.values()).map((item) => (
                    <View key={item.sessionId} style={styles.queueItem}>
                      <View style={styles.queueItemHeader}>
                        <Ionicons
                          name={getQueueStatusIcon(item.status)}
                          size={24}
                          color={getQueueStatusColor(item.status)}
                        />
                        <View style={styles.queueItemInfo}>
                          <Text style={styles.queueItemSession}>
                            {item.sessionId.substring(0, 8)}...
                          </Text>
                          <Text style={styles.queueItemStatus}>
                            {item.status.toUpperCase()}
                          </Text>
                        </View>
                        {(item.status === 'downloading' || item.status === 'queued') && (
                          <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => cancelDownload(item.sessionId)}
                          >
                            <Ionicons name="close-circle" size={24} color="#ff0000" />
                          </TouchableOpacity>
                        )}
                      </View>

                      {item.status === 'downloading' && (
                        <View style={styles.progressContainer}>
                          <View style={styles.progressBar}>
                            <View
                              style={[
                                styles.progressFill,
                                { width: `${item.progress * 100}%` },
                              ]}
                            />
                          </View>
                          <Text style={styles.progressText}>
                            {Math.round(item.progress * 100)}%
                          </Text>
                        </View>
                      )}
                    </View>
                  ))
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
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    padding: 8,
    position: 'relative',
  },
  filterDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00ff00',
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    margin: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#00ff00',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingTop: 8,
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
  deleteActionButton: {
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
  filterSection: {
    padding: 16,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00ff00',
    marginBottom: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#333',
  },
  filterChipActive: {
    backgroundColor: '#00ff00',
    borderColor: '#00ff00',
  },
  filterChipText: {
    color: '#888',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  filterChipTextActive: {
    color: '#000',
    fontWeight: 'bold',
  },
  applyButton: {
    backgroundColor: '#00ff00',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  clearFiltersButton: {
    backgroundColor: '#111',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00ff00',
    alignItems: 'center',
  },
  clearFiltersButtonText: {
    color: '#00ff00',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
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
  audioPlayer: {
    padding: 16,
    backgroundColor: '#000',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00ff00',
  },
  playButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00ff00',
    padding: 16,
    borderRadius: 8,
    gap: 12,
    marginBottom: 12,
  },
  playButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00ff00',
    gap: 12,
  },
  downloadButtonText: {
    color: '#00ff00',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  audioControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 16,
  },
  playButton: {
    backgroundColor: '#111',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00ff00',
  },
  stopButton: {
    backgroundColor: '#111',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff0000',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    color: '#888',
    fontSize: 12,
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
  downloadAllButton: {
    padding: 8,
  },
  queueButton: {
    padding: 8,
    position: 'relative',
  },
  queueBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#ff0000',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  queueBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  emptyQueueContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyQueueText: {
    color: '#888',
    fontSize: 18,
    marginTop: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  emptyQueueSubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  queueItem: {
    backgroundColor: '#000',
    padding: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00ff00',
  },
  queueItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  queueItemInfo: {
    flex: 1,
  },
  queueItemSession: {
    color: '#00ff00',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  queueItemStatus: {
    color: '#0f0',
    fontSize: 12,
    marginTop: 2,
  },
  cancelButton: {
    padding: 4,
  },
  progressContainer: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#222',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00ff00',
  },
  progressText: {
    color: '#00ff00',
    fontSize: 12,
    width: 45,
    textAlign: 'right',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
