# Yappify - Voice-to-Text for Raycast

> 🎤 Yap into your terminal instead of typing. On-device AI transcription using Whisper.cpp.

Press a hotkey → Speak → Text auto-pastes into your terminal. 100% private, no cloud APIs.

---

## 🚀 For End Users (Installing from Raycast Store)

**You don't need to build anything!** Just install and use:

1. Install from Raycast Store (when published)
2. Search "Voice to Text" in Raycast
3. Speak into your mic
4. Text auto-pastes ✨

**Requirements:**

- macOS (Apple Silicon or Intel)
- SoX audio tool: `brew install sox`

---

## 👨‍💻 Notes

This extension uses a **native addon** (compiled C++ code) for AI transcription:

- `addon.node` = Compiled binary (like a `.exe` file)
- Not included in git (security & transparency)
- Built locally during development
- **Raycast builds it automatically when publishing to the store**

### Prerequisites

```bash
# Install system dependencies
brew install sox cmake

# Optional: point Raycast to the SoX recorder if it's outside PATH
export REC_PATH="/opt/homebrew/bin/rec" # or your actual rec path
```

**Note:** whisper.cpp is included as a git submodule

### Build Instructions

```bash
# Clone the repository with submodules
git clone --recursive https://github.com/your-username/yappify.git
cd yappify

# Or if already cloned, initialize submodules
git submodule update --init --recursive

# Install Node.js dependencies (auto-initializes submodules)
pnpm install

# Build the native addon + extension
pnpm run build

# Development mode
pnpm run dev
```

**What `pnpm run build` does:**

1. Initializes whisper.cpp submodule (if not already done)
2. Compiles whisper.cpp addon (`addon.cpp` → `addon.node` binary)
3. Copies `addon.node` to `native/` directory
4. Builds the Raycast extension

## ⚙️ Configuration

Configure in Raycast Preferences → Extensions → Yappify:

| Setting         | Options                    | Description                     |
| --------------- | -------------------------- | ------------------------------- |
| **Model**       | Tiny (75MB) / Base (142MB) | Larger = better quality, slower |
| **Output Mode** | Auto-paste / Clipboard     | Where to put transcribed text   |

---

## 🏗️ Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│   You       │    │ SoX          │    │ Whisper.cpp │    │ AppleScript  │
│   Speak     │───▶│ Records      │───▶│ Transcribes │───▶│ Auto-pastes  │
│   🎤        │    │ (16kHz WAV)  │    │ (addon.node)│    │ ⌨️           │
└─────────────┘    └──────────────┘    └─────────────┘    └──────────────┘
```

### Components

| Service            | Purpose                    | Implementation                    |
| ------------------ | -------------------------- | --------------------------------- |
| **AudioRecorder**  | Captures audio via SoX     | `src/services/audio-recorder.ts`  |
| **ModelManager**   | Downloads Whisper models   | `src/services/model-manager.ts`   |
| **WhisperService** | AI transcription           | `src/services/whisper-service.ts` |
| **PasteService**   | Auto-paste via AppleScript | `src/services/paste-service.ts`   |

---

## 🔒 Security & Privacy

✅ **100% on-device processing** - No cloud APIs
✅ **No telemetry** - No data collection
✅ **Build from source** - No pre-compiled binaries in git
✅ **Auditable** - All source code visible

## 📁 Project Structure

```
yappify/
├── native/
│   └── addon.node                # Locally built binary
├── src/
│   ├── commands/
│   │   └── yap.tsx               # Main command
│   ├── services/
│   │   ├── audio-recorder.ts     # Audio capture
│   │   ├── whisper-service.ts    # AI transcription
│   │   ├── model-manager.ts      # Model downloads
│   │   └── paste-service.ts      # Clipboard/paste
├── package.json                  # Build scripts & metadata
├── BUILD_WORKFLOW.md             # Visual build guide (Mermaid)
├── IMPLEMENTATION_PLAN.md        # Implementation details
└── README.md                     # This file
```

---

## 🚦 Platform Support

| Platform    | Status           | Notes                                   |
| ----------- | ---------------- | --------------------------------------- |
| **macOS**   | ✅ Supported     | Apple Silicon & Intel                   |
| **Windows** | ❌ Not supported | Whisper.cpp Metal backend is macOS-only |
| **Linux**   | ❌ Not supported | Could be added with CPU-only backend    |

---

## 📊 Performance

- **Latency:** ~2-5s total (5s audio with tiny model)
  - Recording: Real-time (5s)
  - Transcription: ~1-2s (tiny) or ~3-4s (base)
  - Paste: <100ms
- **Memory:** ~200MB peak during transcription
- **Disk:** ~76MB (addon + tiny model)

---
