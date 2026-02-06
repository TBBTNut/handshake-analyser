from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
from datetime import datetime
import asyncio
import json
import numpy as np
import io
import base64
import struct
from twilio.rest import Client
from twilio.twiml.voice_response import VoiceResponse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Modem Protocol State Machine
class ModemProtocol:
    """Simulates various modem protocols"""
    
    PROTOCOLS = {
        "V.90": {"speed": 56000, "stages": 12, "duration": 8},
        "V.92": {"speed": 56000, "stages": 13, "duration": 7},
        "V.34": {"speed": 33600, "stages": 10, "duration": 10},
        "V.32bis": {"speed": 14400, "stages": 8, "duration": 12}
    }
    
    @staticmethod
    def get_handshake_stages(protocol: str) -> List[Dict]:
        """Returns the handshake stages for a given protocol"""
        base_stages = [
            {"stage": 1, "name": "Initial Tone", "description": "Sending answer tone (2100 Hz)", "frequency": 2100, "duration": 1.0},
            {"stage": 2, "name": "Phase Shift", "description": "180° phase reversal detection", "frequency": 2100, "duration": 0.5},
            {"stage": 3, "name": "Silence", "description": "Brief silence period", "frequency": 0, "duration": 0.3},
            {"stage": 4, "name": "CM Tone", "description": "Caller modem sends 1300 Hz tone", "frequency": 1300, "duration": 0.8},
            {"stage": 5, "name": "JM Sequence", "description": "Joint menu signal exchange", "frequency": 1650, "duration": 1.2},
            {"stage": 6, "name": "Carrier Detection", "description": "Detecting carrier signal", "frequency": 1800, "duration": 1.0},
            {"stage": 7, "name": "Training", "description": "Line quality training sequence", "frequency": 1900, "duration": 1.5},
            {"stage": 8, "name": "Equalizer", "description": "Adaptive equalizer training", "frequency": 2000, "duration": 1.0},
        ]
        
        if protocol in ["V.90", "V.92"]:
            base_stages.extend([
                {"stage": 9, "name": "Digital Probe", "description": "Testing digital connection", "frequency": 2225, "duration": 1.0},
                {"stage": 10, "name": "Speed Negotiation", "description": "Negotiating 56K speed", "frequency": 2400, "duration": 0.8},
                {"stage": 11, "name": "Final Training", "description": "Final handshake training", "frequency": 2600, "duration": 0.7},
                {"stage": 12, "name": "Connected", "description": "Connection established", "frequency": 0, "duration": 0.5},
            ])
            if protocol == "V.92":
                base_stages.insert(9, {"stage": 9, "name": "QC Mode", "description": "Quick Connect mode check", "frequency": 2200, "duration": 0.4})
        
        elif protocol == "V.34":
            base_stages.extend([
                {"stage": 9, "name": "Speed Negotiation", "description": "Negotiating 33.6K speed", "frequency": 2200, "duration": 1.0},
                {"stage": 10, "name": "Connected", "description": "Connection established", "frequency": 0, "duration": 0.5},
            ])
        
        elif protocol == "V.32bis":
            base_stages.append({"stage": 9, "name": "Connected", "description": "Connection established", "frequency": 0, "duration": 0.5})
        
        return base_stages

# Audio Generation
class AudioGenerator:
    """Generates modem tones and sounds"""
    
    SAMPLE_RATE = 44100
    
    @staticmethod
    def generate_tone(frequency: float, duration: float, sample_rate: int = SAMPLE_RATE) -> bytes:
        """Generate a sine wave tone"""
        if frequency == 0:
            # Silence
            samples = np.zeros(int(sample_rate * duration))
        else:
            t = np.linspace(0, duration, int(sample_rate * duration), False)
            # Add some harmonics for more authentic modem sound
            samples = np.sin(frequency * 2 * np.pi * t) * 0.3
            samples += np.sin(frequency * 2 * 2 * np.pi * t) * 0.1
            samples += np.sin(frequency * 3 * 2 * np.pi * t) * 0.05
            
            # Add some noise for realism
            noise = np.random.normal(0, 0.02, samples.shape)
            samples += noise
            
            # Apply envelope to avoid clicks
            envelope = np.ones_like(samples)
            fade_samples = int(sample_rate * 0.01)  # 10ms fade
            envelope[:fade_samples] = np.linspace(0, 1, fade_samples)
            envelope[-fade_samples:] = np.linspace(1, 0, fade_samples)
            samples *= envelope
        
        # Convert to 16-bit PCM
        samples = np.clip(samples, -1, 1)
        samples = (samples * 32767).astype(np.int16)
        return samples.tobytes()
    
    @staticmethod
    def generate_dial_tone(phone_number: str) -> bytes:
        """Generate DTMF tones for dialing"""
        # DTMF frequencies
        dtmf_freqs = {
            '1': (697, 1209), '2': (697, 1336), '3': (697, 1477),
            '4': (770, 1209), '5': (770, 1336), '6': (770, 1477),
            '7': (852, 1209), '8': (852, 1336), '9': (852, 1477),
            '0': (941, 1336), '*': (941, 1209), '#': (941, 1477)
        }
        
        audio_data = b''
        sample_rate = AudioGenerator.SAMPLE_RATE
        
        for digit in phone_number:
            if digit in dtmf_freqs:
                freq1, freq2 = dtmf_freqs[digit]
                duration = 0.2  # 200ms per digit
                t = np.linspace(0, duration, int(sample_rate * duration), False)
                tone = (np.sin(freq1 * 2 * np.pi * t) + np.sin(freq2 * 2 * np.pi * t)) * 0.5
                tone = np.clip(tone, -1, 1)
                tone = (tone * 32767).astype(np.int16)
                audio_data += tone.tobytes()
                
                # Silence between digits
                silence = np.zeros(int(sample_rate * 0.1), dtype=np.int16)
                audio_data += silence.tobytes()
            elif digit == '-' or digit == ' ':
                # Longer pause for separators
                silence = np.zeros(int(sample_rate * 0.3), dtype=np.int16)
                audio_data += silence.tobytes()
        
        return audio_data
    
    @staticmethod
    def create_wav_base64(audio_data: bytes, sample_rate: int = SAMPLE_RATE) -> str:
        """Convert PCM data to WAV format and encode as base64"""
        wav_buffer = io.BytesIO()
        
        # WAV header
        num_samples = len(audio_data) // 2
        datasize = num_samples * 2
        
        wav_buffer.write(b'RIFF')
        wav_buffer.write(struct.pack('<I', datasize + 36))
        wav_buffer.write(b'WAVE')
        wav_buffer.write(b'fmt ')
        wav_buffer.write(struct.pack('<I', 16))  # fmt chunk size
        wav_buffer.write(struct.pack('<H', 1))   # PCM format
        wav_buffer.write(struct.pack('<H', 1))   # mono
        wav_buffer.write(struct.pack('<I', sample_rate))
        wav_buffer.write(struct.pack('<I', sample_rate * 2))  # byte rate
        wav_buffer.write(struct.pack('<H', 2))   # block align
        wav_buffer.write(struct.pack('<H', 16))  # bits per sample
        wav_buffer.write(b'data')
        wav_buffer.write(struct.pack('<I', datasize))
        wav_buffer.write(audio_data)
        
        wav_buffer.seek(0)
        wav_data = wav_buffer.read()
        return base64.b64encode(wav_data).decode('utf-8')

# Models
class ISPNumber(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone_number: str
    country: str
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ISPNumberCreate(BaseModel):
    name: str
    phone_number: str
    country: str

class TwilioSettings(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    account_sid: str
    auth_token: str
    phone_number: str
    enabled: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class TwilioSettingsCreate(BaseModel):
    account_sid: str
    auth_token: str
    phone_number: str
    enabled: bool = True

class TwilioSettingsResponse(BaseModel):
    id: str
    account_sid: str
    phone_number: str
    enabled: bool
    auth_token_masked: str
    created_at: datetime
    updated_at: datetime

class DialRequest(BaseModel):
    protocol: str
    phone_number: str
    isp_name: Optional[str] = None
    use_twilio: bool = False

class HandshakeStage(BaseModel):
    stage: int
    name: str
    description: str
    frequency: float
    duration: float
    audio_base64: Optional[str] = None

class DialResponse(BaseModel):
    session_id: str
    protocol: str
    phone_number: str
    stages: List[HandshakeStage]
    dial_tone_base64: str
    estimated_duration: float
    mode: str  # "simulator" or "real_call"
    twilio_call_sid: Optional[str] = None

# Initialize ISP database with known numbers
@app.on_event("startup")
async def startup_event():
    """Initialize database with known ISP numbers"""
    existing_count = await db.isp_numbers.count_documents({})
    
    if existing_count == 0:
        known_isps = [
            {"name": "AOL", "phone_number": "1-800-827-6364", "country": "USA", "active": True},
            {"name": "NetZero", "phone_number": "1-888-638-9376", "country": "USA", "active": True},
            {"name": "EarthLink", "phone_number": "1-888-327-8454", "country": "USA", "active": True},
            {"name": "AT&T WorldNet", "phone_number": "1-800-967-5363", "country": "USA", "active": True},
            {"name": "Juno", "phone_number": "1-800-654-5866", "country": "USA", "active": True},
            {"name": "NetScape", "phone_number": "1-800-638-7223", "country": "USA", "active": True},
            {"name": "Prodigy", "phone_number": "1-800-776-3449", "country": "USA", "active": True},
            {"name": "MSN", "phone_number": "1-800-386-5550", "country": "USA", "active": True},
            {"name": "CompuServe", "phone_number": "1-800-848-8990", "country": "USA", "active": True},
            {"name": "FreeServe", "phone_number": "0808-100-5656", "country": "UK", "active": True},
            {"name": "BT Internet", "phone_number": "0845-769-0040", "country": "UK", "active": True},
            {"name": "Wanadoo", "phone_number": "08-36-65-00-65", "country": "France", "active": True},
            {"name": "T-Online", "phone_number": "0191-11", "country": "Germany", "active": True},
        ]
        
        for isp_data in known_isps:
            isp = ISPNumber(**isp_data, id=str(uuid.uuid4()), created_at=datetime.utcnow())
            await db.isp_numbers.insert_one(isp.dict())
        
        logging.info(f"Initialized database with {len(known_isps)} ISP numbers")

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Modem Emulator API", "version": "1.0"}

@api_router.get("/protocols")
async def get_protocols():
    """Get list of supported modem protocols"""
    return {
        "protocols": [
            {"name": "V.90", "speed": "56K", "description": "56 kbit/s standard"},
            {"name": "V.92", "speed": "56K", "description": "56 kbit/s with Quick Connect"},
            {"name": "V.34", "speed": "33.6K", "description": "33.6 kbit/s standard"},
            {"name": "V.32bis", "speed": "14.4K", "description": "14.4 kbit/s standard"},
        ]
    }

@api_router.get("/isp-numbers", response_model=List[ISPNumber])
async def get_isp_numbers():
    """Get all known ISP phone numbers"""
    isps = await db.isp_numbers.find({"active": True}).to_list(100)
    return [ISPNumber(**isp) for isp in isps]

@api_router.post("/isp-numbers", response_model=ISPNumber)
async def create_isp_number(isp: ISPNumberCreate):
    """Add a new ISP phone number"""
    isp_obj = ISPNumber(**isp.dict())
    await db.isp_numbers.insert_one(isp_obj.dict())
    return isp_obj

# Twilio Settings Endpoints
@api_router.get("/twilio/settings")
async def get_twilio_settings():
    """Get Twilio settings (with masked auth token)"""
    settings = await db.twilio_settings.find_one({})
    if not settings:
        return {
            "configured": False,
            "enabled": False
        }
    
    # Remove MongoDB _id
    if "_id" in settings:
        del settings["_id"]
    
    # Mask auth token
    auth_token = settings.get("auth_token", "")
    masked_token = auth_token[:4] + ("*" * (len(auth_token) - 8)) + auth_token[-4:] if len(auth_token) > 8 else "****"
    
    return {
        "configured": True,
        "id": settings.get("id"),
        "account_sid": settings.get("account_sid"),
        "phone_number": settings.get("phone_number"),
        "enabled": settings.get("enabled", False),
        "auth_token_masked": masked_token,
        "created_at": settings.get("created_at"),
        "updated_at": settings.get("updated_at")
    }

@api_router.post("/twilio/settings")
async def save_twilio_settings(settings: TwilioSettingsCreate):
    """Save or update Twilio settings"""
    try:
        # Test the credentials
        try:
            test_client = Client(settings.account_sid, settings.auth_token)
            # Try to fetch account info to validate credentials
            account = test_client.api.accounts(settings.account_sid).fetch()
            logger.info(f"Twilio credentials validated for account: {account.friendly_name}")
        except Exception as e:
            logger.error(f"Invalid Twilio credentials: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Invalid Twilio credentials: {str(e)}")
        
        # Check if settings already exist
        existing = await db.twilio_settings.find_one({})
        
        if existing:
            # Update existing settings
            await db.twilio_settings.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "account_sid": settings.account_sid,
                    "auth_token": settings.auth_token,
                    "phone_number": settings.phone_number,
                    "enabled": settings.enabled,
                    "updated_at": datetime.utcnow()
                }}
            )
            settings_id = existing["id"]
        else:
            # Create new settings
            settings_obj = TwilioSettings(**settings.dict())
            await db.twilio_settings.insert_one(settings_obj.dict())
            settings_id = settings_obj.id
        
        # Fetch and return the saved settings
        saved_settings = await db.twilio_settings.find_one({"id": settings_id})
        if "_id" in saved_settings:
            del saved_settings["_id"]
        
        # Mask auth token
        auth_token = saved_settings.get("auth_token", "")
        masked_token = auth_token[:4] + ("*" * (len(auth_token) - 8)) + auth_token[-4:] if len(auth_token) > 8 else "****"
        
        return {
            "success": True,
            "message": "Twilio settings saved successfully",
            "settings": {
                "id": saved_settings.get("id"),
                "account_sid": saved_settings.get("account_sid"),
                "phone_number": saved_settings.get("phone_number"),
                "enabled": saved_settings.get("enabled"),
                "auth_token_masked": masked_token,
                "created_at": saved_settings.get("created_at"),
                "updated_at": saved_settings.get("updated_at")
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving Twilio settings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/twilio/settings")
async def delete_twilio_settings():
    """Delete Twilio settings"""
    result = await db.twilio_settings.delete_many({})
    return {
        "success": True,
        "message": f"Deleted {result.deleted_count} Twilio settings",
        "deleted_count": result.deleted_count
    }

@api_router.patch("/twilio/settings/toggle")
async def toggle_twilio(enabled: bool):
    """Enable or disable Twilio integration"""
    result = await db.twilio_settings.update_one(
        {},
        {"$set": {"enabled": enabled, "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Twilio settings not found. Please configure Twilio first.")
    
    return {
        "success": True,
        "enabled": enabled,
        "message": f"Twilio integration {'enabled' if enabled else 'disabled'}"
    }

@api_router.post("/dial", response_model=DialResponse)
async def dial_modem(request: DialRequest):
    """Initiate a modem dial sequence"""
    if request.protocol not in ModemProtocol.PROTOCOLS:
        raise HTTPException(status_code=400, detail="Invalid protocol")
    
    # Generate dial tone audio
    dial_audio = AudioGenerator.generate_dial_tone(request.phone_number)
    dial_tone_base64 = AudioGenerator.create_wav_base64(dial_audio)
    
    # Get handshake stages
    stages = ModemProtocol.get_handshake_stages(request.protocol)
    
    # Generate audio for each stage
    handshake_stages = []
    for stage in stages:
        audio_data = AudioGenerator.generate_tone(stage["frequency"], stage["duration"])
        audio_base64 = AudioGenerator.create_wav_base64(audio_data)
        
        handshake_stages.append(HandshakeStage(
            stage=stage["stage"],
            name=stage["name"],
            description=stage["description"],
            frequency=stage["frequency"],
            duration=stage["duration"],
            audio_base64=audio_base64
        ))
    
    protocol_info = ModemProtocol.PROTOCOLS[request.protocol]
    total_duration = sum(s.duration for s in handshake_stages)
    
    # Create session
    session_id = str(uuid.uuid4())
    mode = "simulator"
    twilio_call_sid = None
    
    # Check if Twilio is enabled and should be used
    if request.use_twilio:
        twilio_settings = await db.twilio_settings.find_one({"enabled": True})
        
        if twilio_settings:
            try:
                # Initialize Twilio client
                twilio_client = Client(
                    twilio_settings["account_sid"],
                    twilio_settings["auth_token"]
                )
                
                # Create TwiML for the call
                twiml_response = VoiceResponse()
                twiml_response.say("Initiating modem handshake sequence.", voice='alice')
                twiml_response.pause(length=1)
                
                # Normalize phone number
                normalized_number = request.phone_number
                if not normalized_number.startswith('+'):
                    normalized_number = '+1' + normalized_number.replace('-', '').replace(' ', '').replace('(', '').replace(')', '')
                
                # Make the call
                call = twilio_client.calls.create(
                    from_=twilio_settings["phone_number"],
                    to=normalized_number,
                    twiml=str(twiml_response),
                    status_callback=f"{os.getenv('BACKEND_URL', 'http://localhost:8001')}/api/call-status/{session_id}",
                    status_callback_event=['initiated', 'ringing', 'answered', 'completed']
                )
                
                twilio_call_sid = call.sid
                mode = "real_call"
                logger.info(f"Twilio call initiated: {call.sid} to {normalized_number}")
                
            except Exception as e:
                logger.error(f"Error initiating Twilio call: {str(e)}")
                # Fall back to simulator mode
                mode = "simulator"
    
    session_data = {
        "session_id": session_id,
        "protocol": request.protocol,
        "phone_number": request.phone_number,
        "isp_name": request.isp_name,
        "started_at": datetime.utcnow(),
        "status": "initiated",
        "mode": mode,
        "twilio_call_sid": twilio_call_sid
    }
    await db.modem_sessions.insert_one(session_data)
    
    return DialResponse(
        session_id=session_id,
        protocol=request.protocol,
        phone_number=request.phone_number,
        stages=handshake_stages,
        dial_tone_base64=dial_tone_base64,
        estimated_duration=total_duration,
        mode=mode,
        twilio_call_sid=twilio_call_sid
    )
    
    # Create session
    session_id = str(uuid.uuid4())
    session_data = {
        "session_id": session_id,
        "protocol": request.protocol,
        "phone_number": request.phone_number,
        "isp_name": request.isp_name,
        "started_at": datetime.utcnow(),
        "status": "initiated"
    }
    await db.modem_sessions.insert_one(session_data)
    
    return DialResponse(
        session_id=session_id,
        protocol=request.protocol,
        phone_number=request.phone_number,
        stages=handshake_stages,
        dial_tone_base64=dial_tone_base64,
        estimated_duration=total_duration
    )

@api_router.get("/session/{session_id}")
async def get_session(session_id: str):
    """Get session details"""
    session = await db.modem_sessions.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # Remove MongoDB's _id field to avoid ObjectId serialization issues
    if "_id" in session:
        del session["_id"]
    # Convert datetime to string for JSON serialization
    if "started_at" in session:
        session["started_at"] = session["started_at"].isoformat()
    return session

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
