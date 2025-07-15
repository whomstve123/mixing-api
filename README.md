# Audio Mixing API

A Node.js API server that mixes audio stems using ffmpeg. Designed to be deployed on Railway as a microservice for Supabase/Next.js applications.

## Features

- 🎵 Mix multiple audio stems into a single MP3 track
- 🔊 Individual volume control for each stem
- 🚀 Ready for Railway deployment
- 🐳 Docker containerized
- 📦 FFmpeg pre-installed

## API Endpoints

### Health Check
```
GET /
```
Returns API status and available endpoints.

### Mix Audio Stems
```
POST /mix
```

**Request Body:**
```json
{
  "stems": [
    "https://example.com/stem1.wav",
    "https://example.com/stem2.wav"
  ],
  "volumes": [1.0, 0.8]
}
```

**Alternative format (also supported):**
```json
{
  "stems": [
    {
      "url": "https://example.com/stem1.wav"
    },
    {
      "url": "https://example.com/stem2.wav"
    }
  ],
  "volumes": [1.0, 0.8]
}
```

**Parameters:**
- `stems` (required): Array of URLs (strings) or objects with `url` property
- `volumes` (optional): Array of volume levels (0.0 to 1.0+) for each stem

**Response:**
- Content-Type: `audio/mpeg`
- Returns the mixed MP3 file as binary data

## Usage Example

```javascript
const response = await fetch('https://your-railway-app.railway.app/mix', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    stems: [
      'https://storage.googleapis.com/stem1.wav',
      'https://storage.googleapis.com/stem2.wav',
      'https://storage.googleapis.com/stem3.wav'
    ],
    volumes: [1.0, 0.8, 0.6]
  })
});

const mixedAudio = await response.blob();
```

## Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install FFmpeg** (if not using Docker):
   - macOS: `brew install ffmpeg`
   - Ubuntu: `sudo apt install ffmpeg`
   - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html)

3. **Start the server:**
   ```bash
   npm start
   ```

The API will be available at `http://localhost:3000`

## Railway Deployment

### Method 1: GitHub Integration (Recommended)

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Deploy on Railway:**
   - Visit [railway.app](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `mixing-api` repository
   - Railway will automatically detect the Dockerfile and deploy

### Method 2: Railway CLI

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login and deploy:**
   ```bash
   railway login
   railway init
   railway up
   ```

## Environment Variables

The app uses the following environment variables:

- `PORT`: Server port (default: 3000, automatically set by Railway)
- `NODE_ENV`: Environment (set to "production" in Dockerfile)

## Docker

**Build locally:**
```bash
docker build -t mixing-api .
docker run -p 3000:3000 mixing-api
```

## Supported Audio Formats

**Input formats:** WAV, MP3, FLAC, AAC, M4A, OGG
**Output format:** MP3 (192kbps)

## Error Handling

The API returns appropriate HTTP status codes:
- `200`: Success
- `400`: Bad request (invalid stems array)
- `500`: Server error (ffmpeg processing failed)

## Performance Notes

- Processing time depends on file sizes and number of stems
- Temporary files are automatically cleaned up after processing
- Railway's free tier has compute limitations for long-running processes

## Integration with Supabase/Next.js

```javascript
// In your Next.js app
export async function mixAudioStems(stemUrls, volumes) {
  const response = await fetch(`${process.env.MIXING_API_URL}/mix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stems: stemUrls, // Now accepts array of URL strings directly
      volumes
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to mix audio');
  }
  
  return response.blob();
}
```

## License

MIT