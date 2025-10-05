from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, List
import httpx
import socketio
import uuid
from datetime import datetime, timedelta
import os

# Initialize FastAPI app
app = FastAPI(title="AI Companion Video Call API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Socket.IO
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

# In-memory storage (use Redis in production)
active_rooms: Dict[str, dict] = {}
room_connections: Dict[str, List[str]] = {}

# Pydantic models
class RoomCreate(BaseModel):
    userId: str
    companionId: Optional[str] = None

class RoomResponse(BaseModel):
    roomId: str
    companionId: Optional[str] = None
    userId: str
    expiresAt: str
    status: str = "active"

class ChatMessage(BaseModel):
    roomId: str
    from_user: str = None
    text: str
    ts: int

class ICEServer(BaseModel):
    urls: List[str] | str
    username: Optional[str] = None
    credential: Optional[str] = None

class WebRTCConfig(BaseModel):
    iceServers: List[ICEServer]

class RecordingResponse(BaseModel):
    recordingId: str
    roomId: str
    url: str

# External API URL for companions
PERSONA_API_URL = "https://persona-fetcher-api.up.railway.app/personas"

# API Routes

@app.get("/")
async def root():
    return {"message": "AI Companion Video Call API", "version": "1.0"}

@app.post("/api/video/rooms", response_model=RoomResponse)
async def create_room(room_data: RoomCreate):
    """Create a new video room"""
    room_id = str(uuid.uuid4())
    expires_at = datetime.now(datetime.timezone.utc) + timedelta(hours=2)

    room_info = {
        "roomId": room_id,
        "companionId": room_data.companionId,
        "userId": room_data.userId,
        "expiresAt": expires_at.isoformat(),
        "status": "active",
        "createdAt": datetime.now(datetime.timezone.utc).isoformat()
    }

    active_rooms[room_id] = room_info
    room_connections[room_id] = []

    return RoomResponse(**room_info)

@app.get("/api/video/rooms/{room_id}", response_model=RoomResponse)
async def get_room(room_id: str):
    """Fetch or validate room info"""
    if room_id not in active_rooms:
        raise HTTPException(status_code=404, detail="Room not found")

    room_info = active_rooms[room_id]

    # Check if room has expired
    expires_at = datetime.fromisoformat(room_info["expiresAt"])
    if datetime.utcnow() > expires_at:
        room_info["status"] = "expired"
        raise HTTPException(status_code=410, detail="Room has expired")

    return RoomResponse(**room_info)

@app.get("/api/webrtc/config", response_model=WebRTCConfig)
async def get_webrtc_config():
    """Provide ICE server configuration"""
    # Get TURN credentials from environment variables
    turn_username = os.getenv("TURN_USERNAME", "")
    turn_credential = os.getenv("TURN_CREDENTIAL", "")
    turn_url = os.getenv("TURN_URL", "turn:global.turn.twilio.com:3478")

    ice_servers = [
        ICEServer(urls=["stun:stun.l.google.com:19302"]),
        ICEServer(urls=["stun:stun1.l.google.com:19302"]),
    ]

    # Add TURN server if credentials are available
    if turn_username and turn_credential:
        ice_servers.append(
            ICEServer(
                urls=turn_url,
                username=turn_username,
                credential=turn_credential
            )
        )

    return WebRTCConfig(iceServers=ice_servers)

@app.get("/api/companions")
async def get_companions():
    """Proxy request to external persona API"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(PERSONA_API_URL)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch companions: {str(e)}"
        )

@app.post("/api/chat/messages")
async def send_chat_message(message: ChatMessage):
    """Receive and store chat messages"""
    room_id = message.roomId

    if room_id not in active_rooms:
        raise HTTPException(status_code=404, detail="Room not found")

    # In production, store in database or emit via WebSocket
    # For now, just acknowledge receipt
    return {
        "success": True,
        "messageId": str(uuid.uuid4()),
        "timestamp": datetime.now(datetime.timezone.utc).isoformat()
    }

@app.post("/api/video/recordings", response_model=RecordingResponse)
async def upload_recording(
    file: UploadFile = File(...),
    roomId: str = None
):
    """Upload recorded session video file"""
    if not roomId or roomId not in active_rooms:
        raise HTTPException(status_code=404, detail="Room not found")

    recording_id = str(uuid.uuid4())

    # In production, upload to cloud storage (S3, GCS, etc.)
    # For now, save locally or return mock URL
    file_location = f"recordings/{recording_id}_{file.filename}"

    # Create recordings directory if it doesn't exist
    os.makedirs("recordings", exist_ok=True)

    # Save file
    with open(file_location, "wb") as f:
        content = await file.read()
        f.write(content)

    return RecordingResponse(
        recordingId=recording_id,
        roomId=roomId,
        url=f"/recordings/{recording_id}_{file.filename}"
    )

# Socket.IO Events

@sio.event
async def connect(sid, environ):
    """Handle client connection"""
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    """Handle client disconnection"""
    print(f"Client disconnected: {sid}")

    # Remove from all rooms
    for room_id, connections in room_connections.items():
        if sid in connections:
            connections.remove(sid)
            # Notify other participants
            await sio.emit('leave', {'userId': sid}, room=room_id, skip_sid=sid)

@sio.event
async def join(sid, data):
    """Handle room join"""
    room_id = data.get('roomId')
    user_id = data.get('userId')
    role = data.get('role')

    if not room_id or room_id not in active_rooms:
        await sio.emit('error', {'message': 'Room not found'}, room=sid)
        return

    # Add to room
    sio.enter_room(sid, room_id)

    if room_id not in room_connections:
        room_connections[room_id] = []
    room_connections[room_id].append(sid)

    print(f"User {user_id} ({role}) joined room {room_id}")

    # Notify others in the room
    await sio.emit(
        'user_joined',
        {'userId': user_id, 'role': role},
        room=room_id,
        skip_sid=sid
    )

@sio.event
async def offer(sid, data):
    """Handle WebRTC offer"""
    room_id = data.get('roomId')
    sdp = data.get('sdp')
    from_user = data.get('from')

    if not room_id:
        return

    print(f"Offer from {from_user} in room {room_id}")

    # Forward offer to other participants
    await sio.emit(
        'offer',
        {'from': from_user, 'sdp': sdp},
        room=room_id,
        skip_sid=sid
    )

@sio.event
async def answer(sid, data):
    """Handle WebRTC answer"""
    room_id = data.get('roomId')
    sdp = data.get('sdp')
    from_user = data.get('from')

    if not room_id:
        return

    print(f"Answer from {from_user} in room {room_id}")

    # Forward answer to other participants
    await sio.emit(
        'answer',
        {'from': from_user, 'sdp': sdp},
        room=room_id,
        skip_sid=sid
    )

@sio.event
async def candidate(sid, data):
    """Handle ICE candidate"""
    room_id = data.get('roomId')
    candidate = data.get('candidate')
    from_user = data.get('from')

    if not room_id:
        return

    # Forward ICE candidate to other participants
    await sio.emit(
        'candidate',
        {'from': from_user, 'candidate': candidate},
        room=room_id,
        skip_sid=sid
    )

@sio.event
async def leave(sid, data):
    """Handle room leave"""
    room_id = data.get('roomId')
    user_id = data.get('userId')

    if not room_id:
        return

    print(f"User {user_id} left room {room_id}")

    # Remove from room
    sio.leave_room(sid, room_id)

    if room_id in room_connections and sid in room_connections[room_id]:
        room_connections[room_id].remove(sid)

    # Notify others
    await sio.emit(
        'user_left',
        {'userId': user_id},
        room=room_id
    )

@sio.event
async def end(sid, data):
    """Handle call end"""
    room_id = data.get('roomId')
    reason = data.get('reason')

    if not room_id:
        return

    print(f"Call ended in room {room_id}: {reason}")

    # Mark room as ended
    if room_id in active_rooms:
        active_rooms[room_id]['status'] = 'ended'

    # Notify all participants
    await sio.emit(
        'call_ended',
        {'reason': reason},
        room=room_id
    )

# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "active_rooms": len(active_rooms),
        "timestamp": datetime.now(datetime.timezone.utc)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(socket_app, host="0.0.0.0", port=8000)