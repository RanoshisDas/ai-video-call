import { useState, useRef, useCallback, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

interface WebRTCConfig {
  iceServers: RTCIceServer[];
}

interface RoomInfo {
  roomId: string;
  companionId?: string;
  userId?: string;
  expiresAt?: string;
}

export const useWebRTC = (apiBaseUrl: string, wsUrl: string) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const currentRoomIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  // Create a new video room
  const createRoom = useCallback(async (): Promise<{ roomId: string }> => {
    const response = await fetch(`${apiBaseUrl}/api/video/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserIdRef.current || `user-${Date.now()}`,
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to create room');
    }
    
    const data: RoomInfo = await response.json();
    return { roomId: data.roomId };
  }, [apiBaseUrl]);

  // Initialize WebRTC peer connection
  const initializePeerConnection = useCallback(async () => {
    try {
      // Fetch ICE server configuration
      const response = await fetch(`${apiBaseUrl}/api/webrtc/config`);
      const config: WebRTCConfig = await response.json();
      
      // Create peer connection
      const pc = new RTCPeerConnection(config);
      peerConnectionRef.current = pc;

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('candidate', {
            roomId: currentRoomIdRef.current,
            from: currentUserIdRef.current,
            candidate: event.candidate,
          });
        }
      };

      // Handle remote stream
      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        setIsConnected(pc.connectionState === 'connected');
      };

      return pc;
    } catch (error) {
      console.error('Error initializing peer connection:', error);
      throw error;
    }
  }, [apiBaseUrl]);

  // Start local media (camera and microphone)
  const startLocalMedia = useCallback(
    async (constraints?: MediaStreamConstraints): Promise<MediaStream> => {
      try {
        const defaultConstraints: MediaStreamConstraints = {
          video: { width: 1280, height: 720 },
          audio: true,
          ...constraints,
        };

        const stream = await navigator.mediaDevices.getUserMedia(defaultConstraints);
        setLocalStream(stream);
        return stream;
      } catch (error) {
        console.error('Error accessing media devices:', error);
        throw error;
      }
    },
    []
  );

  // Join a video room
  const joinRoom = useCallback(
    async (roomId: string, role: 'user' | 'companion'): Promise<void> => {
      currentRoomIdRef.current = roomId;
      currentUserIdRef.current = role === 'user' ? `user-${Date.now()}` : `companion-${roomId}`;

      // Initialize WebSocket connection
      const socket = io(wsUrl);
      socketRef.current = socket;

      // Initialize peer connection
      const pc = await initializePeerConnection();

      // Add local stream tracks to peer connection
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });
      }

      // Socket event listeners
      socket.on('connect', () => {
        socket.emit('join', {
          roomId,
          userId: currentUserIdRef.current,
          role,
        });
      });

      socket.on('offer', async (data: { from: string; sdp: RTCSessionDescriptionInit }) => {
        if (pc.signalingState !== 'stable') return;
        
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('answer', {
          roomId,
          from: currentUserIdRef.current,
          sdp: pc.localDescription,
        });
      });

      socket.on('answer', async (data: { from: string; sdp: RTCSessionDescriptionInit }) => {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      });

      socket.on('candidate', async (data: { from: string; candidate: RTCIceCandidateInit }) => {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
        }
      });

      // If user role, create and send offer
      if (role === 'user') {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        socket.emit('offer', {
          roomId,
          from: currentUserIdRef.current,
          sdp: pc.localDescription,
        });
      }
    },
    [wsUrl, initializePeerConnection, localStream]
  );

  // Toggle microphone
  const toggleMic = useCallback((enabled: boolean): void => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
      setIsMicEnabled(enabled);
    }
  }, [localStream]);

  // Toggle camera
  const toggleCamera = useCallback((enabled: boolean): void => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
      setIsCameraEnabled(enabled);
    }
  }, [localStream]);

  // Start recording
  const startRecording = useCallback((): void => {
    if (!localStream) return;

    recordedChunksRef.current = [];
    const mediaRecorder = new MediaRecorder(localStream, {
      mimeType: 'video/webm;codecs=vp8,opus',
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.start(1000); // Collect data every second
    mediaRecorderRef.current = mediaRecorder;
  }, [localStream]);

  // Stop recording
  const stopRecording = useCallback(async (): Promise<Blob> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder) {
        resolve(new Blob());
        return;
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        resolve(blob);
      };

      mediaRecorder.stop();
    });
  }, []);

  // End call and cleanup
  const endCall = useCallback(async (): Promise<void> => {
    // Emit leave event
    if (socketRef.current && currentRoomIdRef.current) {
      socketRef.current.emit('leave', {
        roomId: currentRoomIdRef.current,
        userId: currentUserIdRef.current,
      });
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    // Disconnect socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setRemoteStream(null);
    setIsConnected(false);
    currentRoomIdRef.current = null;
    currentUserIdRef.current = null;
  }, [localStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endCall();
    };
  }, [endCall]);

  return {
    localStream,
    remoteStream,
    isConnected,
    isMicEnabled,
    isCameraEnabled,
    createRoom,
    joinRoom,
    startLocalMedia,
    toggleMic,
    toggleCamera,
    startRecording,
    stopRecording,
    endCall,
  };
};