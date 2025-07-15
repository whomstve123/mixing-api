const express = require('express');
const ffmpeg = require('ffmpeg-static');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'Audio Mixing API is running',
    version: '1.0.0',
    endpoints: {
      mix: 'POST /mix - Mix audio stems into a single track'
    }
  });
});

// Download file from URL
async function downloadFile(url, filepath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }
  const buffer = await response.buffer();
  fs.writeFileSync(filepath, buffer);
}

// Mix audio files using ffmpeg
function mixAudioFiles(inputFiles, outputFile, volumes = []) {
  return new Promise((resolve, reject) => {
    const args = [];
    
    // Add input files
    inputFiles.forEach(file => {
      args.push('-i', file);
    });
    
    // Build filter complex for mixing
    let filterComplex = '';
    inputFiles.forEach((_, index) => {
      const volume = volumes[index] || 1.0;
      filterComplex += `[${index}:a]volume=${volume}[a${index}];`;
    });
    
    // Mix all audio streams
    const mixInputs = inputFiles.map((_, index) => `[a${index}]`).join('');
    filterComplex += `${mixInputs}amix=inputs=${inputFiles.length}:duration=longest[out]`;
    
    args.push(
      '-filter_complex', filterComplex,
      '-map', '[out]',
      '-c:a', 'mp3',
      '-b:a', '192k',
      '-y', // Overwrite output file
      outputFile
    );
    
    console.log('Running ffmpeg with args:', args);
    
    const ffmpegProcess = spawn(ffmpeg, args);
    
    ffmpegProcess.stderr.on('data', (data) => {
      console.log('ffmpeg stderr:', data.toString());
    });
    
    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg process exited with code ${code}`));
      }
    });
    
    ffmpegProcess.on('error', (error) => {
      reject(error);
    });
  });
}

// Clean up temporary files
function cleanup(files) {
  files.forEach(file => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
        console.log('Cleaned up:', file);
      } catch (error) {
        console.error('Failed to cleanup file:', file, error);
      }
    }
  });
}

// Main mixing endpoint
app.post('/mix', async (req, res) => {
  const requestId = uuidv4();
  console.log(`[${requestId}] Starting mix request`);
  
  let tempFiles = [];
  
  try {
    const { stems, volumes } = req.body;
    
    if (!stems || !Array.isArray(stems) || stems.length === 0) {
      return res.status(400).json({ 
        error: 'stems array is required and must not be empty' 
      });
    }
    
    console.log(`[${requestId}] Received stems:`, stems);
    console.log(`[${requestId}] Processing ${stems.length} stems`);
    
    // Validate and normalize stems
    const validatedStems = [];
    for (let i = 0; i < stems.length; i++) {
      const stem = stems[i];
      console.log(`[${requestId}] Processing stem ${i}:`, typeof stem, stem);
      
      let stemUrl;
      
      // Handle both string URLs and object format
      if (typeof stem === 'string') {
        stemUrl = stem;
      } else if (stem && typeof stem === 'object' && stem.url) {
        stemUrl = stem.url;
      } else {
        console.error(`[${requestId}] Invalid stem at index ${i}:`, stem);
        return res.status(400).json({ 
          error: `Invalid stem at index ${i}. Expected string URL or object with url property`,
          received: stem,
          requestId 
        });
      }
      
      // Validate URL
      if (typeof stemUrl !== 'string' || stemUrl.trim() === '') {
        console.error(`[${requestId}] Invalid URL at index ${i}:`, stemUrl);
        return res.status(400).json({ 
          error: `Invalid URL at index ${i}. Expected non-empty string`,
          received: stemUrl,
          requestId 
        });
      }
      
      validatedStems.push(stemUrl.trim());
    }
    
    // Download all stem files
    const inputFiles = [];
    for (let i = 0; i < validatedStems.length; i++) {
      const stemUrl = validatedStems[i];
      
      // Extract file extension safely
      let extension = 'wav'; // default
      try {
        const urlParts = stemUrl.split('.');
        if (urlParts.length > 1) {
          extension = urlParts.pop().split('?')[0]; // Remove query params if any
        }
      } catch (error) {
        console.warn(`[${requestId}] Could not extract extension from URL: ${stemUrl}, using default 'wav'`);
      }
      
      const filename = `${requestId}_stem_${i}.${extension}`;
      const filepath = path.join(tempDir, filename);
      
      console.log(`[${requestId}] Downloading stem ${i + 1}/${validatedStems.length}: ${stemUrl}`);
      await downloadFile(stemUrl, filepath);
      
      inputFiles.push(filepath);
      tempFiles.push(filepath);
    }
    
    // Prepare output file
    const outputFilename = `${requestId}_mixed.mp3`;
    const outputPath = path.join(tempDir, outputFilename);
    tempFiles.push(outputPath);
    
    // Mix the audio files
    console.log(`[${requestId}] Mixing audio files...`);
    await mixAudioFiles(inputFiles, outputPath, volumes);
    
    // Check if output file was created
    if (!fs.existsSync(outputPath)) {
      throw new Error('Mixed audio file was not created');
    }
    
    console.log(`[${requestId}] Mix completed successfully`);
    
    // Send the mixed file
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="mixed_${requestId}.mp3"`);
    
    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);
    
    fileStream.on('end', () => {
      console.log(`[${requestId}] File sent, cleaning up...`);
      // Clean up after a short delay to ensure file transfer is complete
      setTimeout(() => cleanup(tempFiles), 5000);
    });
    
    fileStream.on('error', (error) => {
      console.error(`[${requestId}] Stream error:`, error);
      cleanup(tempFiles);
    });
    
  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    cleanup(tempFiles);
    
    res.status(500).json({ 
      error: 'Failed to mix audio files',
      details: error.message,
      requestId 
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    details: error.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Audio Mixing API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
  console.log(`Mix endpoint: POST http://localhost:${PORT}/mix`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});
