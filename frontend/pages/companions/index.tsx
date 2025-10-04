import  { useEffect, useState } from 'react';
import VideoCallModal from "../../components/VideoCallModal";

interface Companion {
    avatar_id: string;
    name: string;
    link: string;
    avatar_image_url?: string;
    role?: string;
    voiceId?: string;
    metadata?: Record<string, any>;
}

const CompanionsPage: React.FC = () => {
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompanion, setSelectedCompanion] = useState<Companion | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
  const userId = `user-${Date.now()}`;

  // Fetch companions on mount
  useEffect(() => {
    fetchCompanions();
  }, []);

  const fetchCompanions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/companions`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch companions');
      }
      
      const data = await response.json();
// Map to Companion[]
        const companionsList: Companion[] = data
            .map((item: any) => item.companion)
            .filter(Boolean); // remove null/undefined

        setCompanions(companionsList);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching companions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartCall = async (companion: Companion) => {
    try {
      // Create a new room
      const response = await fetch(`${API_BASE_URL}/api/video/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          companionId: companion.avatar_id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create room');
      }

      const { roomId: newRoomId } = await response.json();
      setRoomId(newRoomId);
      setSelectedCompanion(companion);
    } catch (err) {
      console.error('Error starting call:', err);
      alert('Failed to start call. Please try again.');
    }
  };

  const handleEndCall = async (recordingBlob?: Blob) => {
    if (recordingBlob && roomId) {
      try {
        // Upload recording
        const formData = new FormData();
        formData.append('file', recordingBlob, `recording-${roomId}.webm`);
        formData.append('roomId', roomId);

        await fetch(`${API_BASE_URL}/api/video/recordings`, {
          method: 'POST',
          body: formData,
        });
      } catch (err) {
        console.error('Error uploading recording:', err);
      }
    }

    setSelectedCompanion(null);
    setRoomId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading companions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error: {error}</p>
          <button
            onClick={fetchCompanions}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">AI Companions</h1>
          <p className="mt-2 text-gray-600">
            Select an AI companion to start your video call
          </p>
        </div>
      </div>

      {/* Companions Grid */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {companions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No companions available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {companions.map((companion) => (
              <div
                key={companion.avatar_id}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow cursor-pointer"
                onClick={() => handleStartCall(companion)}
              >
                <div className="aspect-w-3 aspect-h-4 bg-gray-200">
                  <img
                    src={companion.link || companion.avatar_image_url }
                    alt={companion.name}
                    className="w-full h-64 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src ='https://via.placeholder.com/300';
                    }}
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {companion.name}
                  </h3>
                  {companion.role && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      {companion.role}
                    </p>
                  )}
                  {companion.voiceId && (
                    <div className="flex items-center text-xs text-gray-500">
                      <span className="mr-1">🎤</span>
                      <span>ElevenLabs Voice</span>
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartCall(companion);
                    }}
                    className="mt-4 w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Start Call
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Video Call Modal */}
      {selectedCompanion && roomId && (
        <VideoCallModal
          roomId={roomId}
          userId={userId}
          companion={selectedCompanion}
          onEnd={handleEndCall}
          captions={true}
        />
      )}
    </div>
  );
};

export default CompanionsPage;