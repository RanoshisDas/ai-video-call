import { Camera, CameraOff, CircleDot, CircleStop, MessageCircle, Mic, MicOff, Phone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// Companion type
interface Companion {
  avatar_id: string;
  name: string;
  link: string;
}

// Props interface
interface VideoCallModalProps {
  roomId: string;
  userId: string;
  companion: Companion;
  onEnd: (recordingBlob?: Blob) => Promise<void>;
  captions: boolean;
}

// WebRTC hook
const useMockWebRTC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    // Simulate connection after 2 seconds
    const timer = setTimeout(() => setIsConnected(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  return {
    isConnected,
    isMicEnabled,
    isCameraEnabled,
    isRecording,
    toggleMic: () => setIsMicEnabled((prev) => !prev),
    toggleCamera: () => setIsCameraEnabled((prev) => !prev),
    toggleRecording: () => setIsRecording((prev) => !prev),
  };
};

const VideoCallModal: React.FC<VideoCallModalProps> = ({
  roomId,
  userId,
  companion,
  onEnd,
  captions,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const [messages, setMessages] = useState([
    { from: 'companion', text: 'Hello! How can I help you today?', timestamp: Date.now() - 5000 },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(true);

  const {
    isConnected,
    isMicEnabled,
    isCameraEnabled,
    isRecording,
    toggleMic,
    toggleCamera,
    toggleRecording,
  } = useMockWebRTC();

  // Initialize mock video streams
  useEffect(() => {
    const initVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.log('Camera access denied - using placeholder');
      }
    };

    if (isModalOpen) {
      initVideo();
    }

    return () => {
      if (localVideoRef.current?.srcObject instanceof MediaStream) {
        const tracks = localVideoRef.current.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, [isModalOpen]);

  // Call duration timer
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => setCallDuration((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [isConnected]);

  // Format call duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle sending messages
  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    const message = {
      from: 'user',
      text: inputMessage,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, message]);
    setInputMessage('');

    // Simulate companion response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          from: 'companion',
          text: 'I understand. Let me help you with that.',
          timestamp: Date.now(),
        },
      ]);
    }, 1000);
  };

  // Handle end call
  const handleEndCall = async () => {
    setIsModalOpen(false);
    if (isRecording) {
      // Mock recording blob
      const fakeBlob = new Blob(['Recording data'], { type: 'text/plain' });
      await onEnd(fakeBlob);
    } else {
      await onEnd();
    }
  };

  if (!isModalOpen) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">✓</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Call Ended</h2>
          <p className="text-gray-600 mb-4">Duration: {formatDuration(callDuration)}</p>
          {isRecording && (
            <p className="text-sm text-gray-500 mb-4">Recording saved successfully</p>
          )}
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Start New Call
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900 flex items-center justify-center z-50">
      <div className="w-full h-full flex flex-col">
        {/* Header */}
        <div className="bg-gray-800 px-6 py-4 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <img
              src={companion.link}
              alt={companion.name}
              className="w-12 h-12 rounded-full border-2 border-blue-500"
            />
            <div>
              <h2 className="text-white font-semibold text-lg">{companion.name}</h2>
              <span className="text-sm flex items-center">
                <span
                  className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'
                    }`}
                ></span>
                <span className="text-gray-400">
                  {isConnected ? 'Connected' : 'Connecting...'}
                </span>
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-white font-mono text-xl bg-gray-700 px-4 py-2 rounded-lg">
              {formatDuration(callDuration)}
            </div>
            {isRecording && (
              <div className="flex items-center space-x-2 bg-red-500 px-3 py-2 rounded-lg">
                <span className="w-3 h-3 bg-white rounded-full animate-pulse"></span>
                <span className="text-white text-sm font-medium">REC</span>
              </div>
            )}
          </div>
        </div>

        {/* Video Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 bg-gray-900">
          {/* Remote Video */}
          <div className="relative bg-gray-800 rounded-2xl overflow-hidden shadow-2xl">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            {!isConnected && (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                <div className="text-center">
                  <img
                    src={companion.link}
                    alt={companion.name}
                    className="w-32 h-32 rounded-full mx-auto mb-4 border-4 border-blue-500"
                  />
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                      style={{ animationDelay: '0.1s' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                      style={{ animationDelay: '0.2s' }}
                    ></div>
                  </div>
                  <p className="text-gray-400 mt-4">Waiting for {companion.name}...</p>
                </div>
              </div>
            )}
            <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white px-3 py-1 rounded-lg text-sm font-medium">
              {companion.name}
            </div>
          </div>

          {/* Local Video / Chat Panel */}
          <div className="relative bg-gray-800 rounded-2xl overflow-hidden shadow-2xl">
            {!showChat ? (
              <>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!isCameraEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
                    <div className="text-center">
                      <div className="w-24 h-24 bg-gray-600 rounded-full mx-auto mb-4 flex items-center justify-center shadow-xl">
                        <span className="text-4xl">👤</span>
                      </div>
                      <p className="text-gray-300 font-medium">Camera Off</p>
                    </div>
                  </div>
                )}
                <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white px-3 py-1 rounded-lg text-sm font-medium">
                  You
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col bg-gray-800">
                <div className="px-4 py-3 border-b border-gray-700">
                  <h3 className="text-white font-semibold">Chat</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs px-4 py-2 rounded-2xl shadow-lg ${msg.from === 'user'
                          ? 'bg-blue-600 text-white rounded-br-none'
                          : 'bg-gray-700 text-white rounded-bl-none'
                          }`}
                      >
                        <p className="text-sm">{msg.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t border-gray-700">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Type a message..."
                      className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
                    />
                    <button
                      onClick={handleSendMessage}
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="bg-gray-800 px-6 py-6 flex items-center justify-center space-x-4 border-t border-gray-700">
          <button
            onClick={toggleMic}
            className={`p-5 rounded-full transition-all duration-200 shadow-lg ${isMicEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'
              } text-white`}
            title={isMicEnabled ? 'Mute' : 'Unmute'}
          >
            <span className="text-2xl">{isMicEnabled ? <Mic /> : <MicOff />}</span>
          </button>

          <button
            onClick={toggleCamera}
            className={`p-5 rounded-full transition-all duration-200 shadow-lg ${isCameraEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'
              } text-white`}
            title={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            <span className="text-2xl">{isCameraEnabled ? <Camera /> : <CameraOff />}</span>
          </button>

          <button
            onClick={() => setShowChat(!showChat)}
            className="p-5 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-all duration-200 shadow-lg relative"
            title="Toggle chat"
          >
            <span className="text-2xl">
              <MessageCircle />
            </span>
            {messages.length > 0 && !showChat && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full text-xs flex items-center justify-center">
                {messages.length}
              </span>
            )}
          </button>

          <button
            onClick={toggleRecording}
            className={`p-5 rounded-full transition-all duration-200 shadow-lg ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
              } text-white`}
            title={isRecording ? 'Stop recording' : 'Start recording'}
          >
            <span className="text-2xl">{isRecording ? <CircleStop /> : <CircleDot />}</span>
          </button>

          <div className="w-px h-12 bg-gray-700 mx-2"></div>

          <button
            onClick={handleEndCall}
            className="px-8 py-5 rounded-full bg-red-600 hover:bg-red-700 text-white font-semibold transition-all duration-200 shadow-lg flex items-center space-x-2"
          >
            <span className="text-xl"><Phone /></span>
            <span>End Call</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoCallModal;
