import React, { useRef, useEffect, useState } from 'react';

const AudioFloraVisualizer = () => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const dataArrayRef = useRef(null);
  
  // Audio levels state
  const [audioLevels, setAudioLevels] = useState({
    volume: 0,
    bass: 0,
    mids: 0,
    treble: 0
  });
  
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [error, setError] = useState('');

  // Configuration
  const CONFIG = {
    WIDTH: 1920,
    HEIGHT: 1080,
    FPS: 60,
    SAMPLE_RATE: 44100,
    FFT_SIZE: 2048,
    BASS_RANGE: [0, 15],      // Frequency bins for bass
    MIDS_RANGE: [16, 120],    // Frequency bins for mids
    TREBLE_RANGE: [121, 512], // Frequency bins for treble
  };

  // Colors
  const COLORS = {
    BG: 'rgb(15, 10, 20)',
    BRANCH: 'rgb(80, 60, 40)',
    FLOWER_LOW: 'rgba(150, 170, 200, 0.6)',
    FLOWER_MID: 'rgba(100, 130, 220, 0.8)',
    FLOWER_HIGH: 'rgba(200, 220, 255, 0.4)',
    LEAF_START: 'rgba(40, 60, 45, 0.8)',
    LEAF_END: 'rgba(90, 130, 95, 0.8)',
    SPARKLE: 'rgba(240, 245, 255, 0.9)',
    CENTER: 'rgb(255, 255, 200)'
  };

  // Utility functions
  const smoothValue = (current, target, factor) => {
    return current + (target - current) * factor;
  };

  const random = (min, max) => Math.random() * (max - min) + min;

  const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Sparkle class
  class Sparkle {
    constructor(pos) {
      this.pos = { x: pos.x, y: pos.y };
      const angle = Math.random() * 2 * Math.PI;
      const speed = random(0.8, 2.5);
      this.vel = {
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed
      };
      this.life = random(0.6, 1.2);
      this.maxLife = this.life;
      this.size = random(1, 3);
    }

    update() {
      this.pos.x += this.vel.x;
      this.pos.y += this.vel.y;
      this.vel.x *= 0.93;
      this.vel.y *= 0.93;
      this.life -= 1 / CONFIG.FPS;
    }

    draw(ctx) {
      if (this.life > 0) {
        const currentSize = this.size * (this.life / this.maxLife);
        const alpha = this.life / this.maxLife;
        
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = COLORS.SPARKLE;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, currentSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    isDead() {
      return this.life <= 0;
    }
  }

  // Leaf class
  class Leaf {
    constructor(branch, posOnBranch, angleOffset) {
      this.branch = branch;
      this.position = posOnBranch;
      this.angleOffset = angleOffset + random(-10, 10);
      this.length = random(35, 70);
      this.width = random(8, 18);
      this.growth = 0;
      this.curveFactor = random(0.3, 0.7);
    }

    update(audio, branchGrowth) {
      if (branchGrowth > 0.4) {
        const targetGrowth = Math.min(audio.mids * 1.5, 1);
        this.growth = smoothValue(this.growth, targetGrowth, 0.07);
      } else {
        this.growth = smoothValue(this.growth, 0, 0.12);
      }
    }

    draw(ctx) {
      if (this.growth > 0.05) {
        const branchVec = {
          x: this.branch.endPos.x - this.branch.startPos.x,
          y: this.branch.endPos.y - this.branch.startPos.y
        };
        
        const startPos = {
          x: this.branch.startPos.x + branchVec.x * this.position,
          y: this.branch.startPos.y + branchVec.y * this.position
        };
        
        const branchAngle = Math.atan2(branchVec.y, branchVec.x) * 180 / Math.PI;
        const baseAngle = branchAngle + this.angleOffset;
        
        // Interpolate leaf color
        const t = this.growth;
        const r = Math.floor((1 - t) * 40 + t * 90);
        const g = Math.floor((1 - t) * 60 + t * 130);
        const b = Math.floor((1 - t) * 45 + t * 95);
        
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
        
        // Draw curved leaf shape
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        
        const numSegments = 8;
        const rad = baseAngle * Math.PI / 180;
        
        // One side of the leaf
        for (let i = 1; i <= numSegments; i++) {
          const t = i / numSegments;
          const currentLen = t * this.length * this.growth;
          const curveOffset = Math.sin(t * Math.PI) * this.width * this.growth * this.curveFactor;
          
          const x = startPos.x + Math.cos(rad) * currentLen - Math.sin(rad) * curveOffset;
          const y = startPos.y + Math.sin(rad) * currentLen + Math.cos(rad) * curveOffset;
          ctx.lineTo(x, y);
        }
        
        // Other side of the leaf
        for (let i = numSegments - 1; i > 0; i--) {
          const t = i / numSegments;
          const currentLen = t * this.length * this.growth;
          const curveOffset = Math.sin(t * Math.PI) * this.width * this.growth * this.curveFactor;
          
          const x = startPos.x + Math.cos(rad) * currentLen + Math.sin(rad) * curveOffset;
          const y = startPos.y + Math.sin(rad) * currentLen - Math.cos(rad) * curveOffset;
          ctx.lineTo(x, y);
        }
        
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // Flower class
  class Flower {
    constructor(branch, posOnBranch) {
      this.branch = branch;
      this.position = posOnBranch;
      this.bloom = 0;
      this.size = random(15, 28);
      this.rotation = random(0, 360);
      this.numPetals = Math.floor(random(6, 8));
      this.lastBloom = 0;
    }

    update(audio, branchGrowth, sparkles) {
      if (branchGrowth > 0.7) {
        const targetBloom = Math.min(audio.treble * 1.5, 1);
        this.bloom = smoothValue(this.bloom, targetBloom, 0.1);
      } else {
        this.bloom = smoothValue(this.bloom, 0, 0.1);
      }

      if (this.bloom > 0.5 && this.bloom > this.lastBloom + 0.05) {
        const pos = {
          x: this.branch.startPos.x + (this.branch.endPos.x - this.branch.startPos.x) * this.position,
          y: this.branch.startPos.y + (this.branch.endPos.y - this.branch.startPos.y) * this.position
        };
        
        for (let i = 0; i < Math.floor(random(1, 3)); i++) {
          sparkles.push(new Sparkle(pos));
        }
      }
      this.lastBloom = this.bloom;
      this.rotation += audio.treble * 20;
    }

    draw(ctx) {
      if (this.bloom > 0.05) {
        const pos = {
          x: this.branch.startPos.x + (this.branch.endPos.x - this.branch.startPos.x) * this.position,
          y: this.branch.startPos.y + (this.branch.endPos.y - this.branch.startPos.y) * this.position
        };
        
        const currentSize = this.size * this.bloom;
        
        // Draw petals with watercolor effect
        for (let i = 0; i < this.numPetals; i++) {
          const angle = (this.rotation + i * (360 / this.numPetals)) * Math.PI / 180;
          const petalPos = {
            x: pos.x + Math.cos(angle) * currentSize * 0.4,
            y: pos.y + Math.sin(angle) * currentSize * 0.4
          };
          
          // Main petal
          ctx.fillStyle = COLORS.FLOWER_MID;
          ctx.beginPath();
          ctx.arc(petalPos.x, petalPos.y, currentSize * 0.5, 0, Math.PI * 2);
          ctx.fill();
          
          // Highlight
          if (this.bloom > 0.3) {
            ctx.fillStyle = COLORS.FLOWER_HIGH;
            const highlightAngle = angle + 0.175; // 10 degrees offset
            const highlightPos = {
              x: petalPos.x + Math.cos(highlightAngle) * currentSize * 0.1,
              y: petalPos.y + Math.sin(highlightAngle) * currentSize * 0.1
            };
            ctx.beginPath();
            ctx.arc(highlightPos.x, highlightPos.y, currentSize * 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        
        // Draw center
        ctx.fillStyle = COLORS.CENTER;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, currentSize * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Branch class
  class Branch {
    constructor(startPos, angle, maxLength, thickness, depth = 0) {
      this.startPos = startPos;
      this.angle = angle;
      this.maxLength = maxLength;
      this.thickness = thickness;
      this.depth = depth;
      this.growth = 0;
      this.pulse = 1;
      
      this.children = [];
      this.flowers = [];
      this.leaves = [];
      
      if (this.depth < 7) {
        this.createChildren();
      }
    }
    
    get endPos() {
      const radAngle = this.angle * Math.PI / 180;
      const length = this.maxLength * this.growth;
      return {
        x: this.startPos.x + Math.cos(radAngle) * length,
        y: this.startPos.y + Math.sin(radAngle) * length
      };
    }
    
    createChildren() {
      const endPosFull = {
        x: this.startPos.x + Math.cos(this.angle * Math.PI / 180) * this.maxLength,
        y: this.startPos.y + Math.sin(this.angle * Math.PI / 180) * this.maxLength
      };
      
      // Add flowers to deeper branches
      if (this.depth >= 4 && Math.random() < 0.7) {
        this.flowers.push(new Flower(this, random(0.5, 1.0)));
      }
      
      // Add leaves to mid-level branches
      if (this.depth >= 2 && this.depth <= 5 && Math.random() < 0.8) {
        this.leaves.push(new Leaf(this, random(0.2, 0.8), randomChoice([-55, 55])));
      }
      
      // Create child branches
      if (this.depth < 6) {
        const numBranches = Math.floor(random(1, 3));
        for (let i = 0; i < numBranches; i++) {
          this.children.push(new Branch(
            endPosFull,
            this.angle + random(-35, 35),
            this.maxLength * random(0.6, 0.9),
            Math.max(1, this.thickness * 0.7),
            this.depth + 1
          ));
        }
      }
    }
    
    update(audio, sparkles) {
      const targetGrowth = Math.min(audio.mids * 1.2, 1);
      this.growth = smoothValue(this.growth, targetGrowth, 0.06);
      this.pulse = 1.0 + audio.bass * 0.1 * Math.max(0, 4 - this.depth);
      
      const currentEndPos = this.endPos;
      if (this.growth > 0.05) {
        this.children.forEach(child => {
          child.startPos = currentEndPos;
          child.update(audio, sparkles);
        });
      }
      
      this.flowers.forEach(flower => flower.update(audio, this.growth, sparkles));
      this.leaves.forEach(leaf => leaf.update(audio, this.growth));
    }
    
    draw(ctx) {
      if (this.growth > 0.01) {
        const endPos = this.endPos;
        const thickness = Math.max(1, this.thickness * this.growth * this.pulse);
        
        ctx.strokeStyle = COLORS.BRANCH;
        ctx.lineWidth = thickness;
        ctx.beginPath();
        ctx.moveTo(this.startPos.x, this.startPos.y);
        ctx.lineTo(endPos.x, endPos.y);
        ctx.stroke();
        
        this.leaves.forEach(leaf => leaf.draw(ctx));
        this.children.forEach(child => child.draw(ctx));
        this.flowers.forEach(flower => flower.draw(ctx));
      }
    }
  }

  // Main visualization state
  const visualizationState = useRef({
    plant: null,
    sparkles: [],
    cameraShake: 0,
    peakLevels: { volume: 1e-5, bass: 1e-5, mids: 1e-5, treble: 1e-5 }
  });

  // Initialize audio
  const initializeAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = CONFIG.FFT_SIZE;
      analyserRef.current.smoothingTimeConstant = 0.3;
      
      source.connect(analyserRef.current);
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);
      
      setIsAudioEnabled(true);
      setError('');
    } catch (err) {
      setError('Microphone access denied. Using simulated audio.');
      setIsAudioEnabled(false);
    }
  };

  // Process audio data
  const processAudio = () => {
    if (!analyserRef.current || !dataArrayRef.current) {
      // Simulated audio for when mic is not available
      const t = Date.now() / 1000;
      return {
        volume: (Math.sin(t * 2) + 1) / 2,
        bass: (Math.sin(t * 2 + Math.PI) + 1) / 2,
        mids: (Math.sin(t * 4) + 1) / 2,
        treble: (Math.sin(t * 8) + 1) / 2
      };
    }
    
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    
    const bass = dataArrayRef.current.slice(CONFIG.BASS_RANGE[0], CONFIG.BASS_RANGE[1])
      .reduce((sum, val) => sum + val, 0) / (CONFIG.BASS_RANGE[1] - CONFIG.BASS_RANGE[0]);
      
    const mids = dataArrayRef.current.slice(CONFIG.MIDS_RANGE[0], CONFIG.MIDS_RANGE[1])
      .reduce((sum, val) => sum + val, 0) / (CONFIG.MIDS_RANGE[1] - CONFIG.MIDS_RANGE[0]);
      
    const treble = dataArrayRef.current.slice(CONFIG.TREBLE_RANGE[0], CONFIG.TREBLE_RANGE[1])
      .reduce((sum, val) => sum + val, 0) / (CONFIG.TREBLE_RANGE[1] - CONFIG.TREBLE_RANGE[0]);
      
    const volume = dataArrayRef.current.reduce((sum, val) => sum + val, 0) / dataArrayRef.current.length;
    
    return {
      volume: volume / 255,
      bass: bass / 255,
      mids: mids / 255,
      treble: treble / 255
    };
  };

  // Animation loop
  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const { plant, sparkles, peakLevels } = visualizationState.current;
    
    // Process audio
    const rawAudio = processAudio();
    const normalizedAudio = {};
    
    // Normalize and smooth audio levels
    Object.keys(rawAudio).forEach(key => {
      peakLevels[key] = Math.max(peakLevels[key], rawAudio[key]);
      const normalized = rawAudio[key] / peakLevels[key];
      normalizedAudio[key] = isNaN(normalized) ? 0 : normalized;
      peakLevels[key] *= 0.999; // Decay peaks
    });
    
    // Smooth the audio levels
    setAudioLevels(prev => ({
      volume: smoothValue(prev.volume, normalizedAudio.volume, 0.35),
      bass: smoothValue(prev.bass, normalizedAudio.bass, 0.35),
      mids: smoothValue(prev.mids, normalizedAudio.mids, 0.35),
      treble: smoothValue(prev.treble, normalizedAudio.treble, 0.35)
    }));
    
    // Update plant
    if (plant) {
      plant.update(normalizedAudio, sparkles);
    }
    
    // Update sparkles
    sparkles.forEach(sparkle => sparkle.update());
    visualizationState.current.sparkles = sparkles.filter(sparkle => !sparkle.isDead());
    
    // Update camera shake
    visualizationState.current.cameraShake = normalizedAudio.bass * 8;
    
    // Clear canvas
    ctx.fillStyle = COLORS.BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Apply camera shake
    const shakeX = (Math.random() - 0.5) * visualizationState.current.cameraShake;
    const shakeY = (Math.random() - 0.5) * visualizationState.current.cameraShake;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    
    // Draw plant
    if (plant) {
      plant.draw(ctx);
    }
    
    // Draw sparkles
    sparkles.forEach(sparkle => sparkle.draw(ctx));
    
    ctx.restore();
    
    animationRef.current = requestAnimationFrame(animate);
  };

  // Initialize everything
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Set canvas size
    canvas.width = CONFIG.WIDTH;
    canvas.height = CONFIG.HEIGHT;
    
    // Initialize plant
    visualizationState.current.plant = new Branch(
      { x: CONFIG.WIDTH / 2, y: CONFIG.HEIGHT + 20 },
      -90,
      CONFIG.HEIGHT / 3.5,
      25
    );
    
    // Start animation
    animate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <div className="w-full h-screen bg-gray-900 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full object-contain"
        style={{ imageRendering: 'pixelated' }}
      />
      
      {/* Controls */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-50 rounded-lg p-4 text-white">
        <div className="mb-4">
          <button
            onClick={initializeAudio}
            disabled={isAudioEnabled}
            className={`px-4 py-2 rounded ${
              isAudioEnabled 
                ? 'bg-green-600 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
            } text-white transition-colors`}
          >
            {isAudioEnabled ? '🎤 Audio Active' : '🎤 Enable Audio'}
          </button>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>
        
        {/* Audio level indicators */}
        <div className="space-y-2">
          {Object.entries(audioLevels).map(([key, value]) => (
            <div key={key} className="flex items-center space-x-2">
              <span className="w-16 text-sm uppercase">{key}:</span>
              <div className="w-32 h-2 bg-gray-600 rounded">
                <div 
                  className="h-full bg-gradient-to-r from-green-400 to-red-500 rounded transition-all duration-75"
                  style={{ width: `${Math.min(value * 100, 100)}%` }}
                />
              </div>
              <span className="text-xs w-12">{value.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Instructions */}
      <div className="absolute bottom-4 right-4 bg-black bg-opacity-50 rounded-lg p-3 text-white text-sm max-w-xs">
        <p className="mb-1">🎵 <strong>Audio Flora - Watercolor Bloom</strong></p>
        <p className="text-xs opacity-75">
          Bass pulses through the trunk, mids grow branches and leaves, 
          treble makes flowers bloom with sparkles. Play music or make sounds!
        </p>
        <p className="text-xs opacity-50 mt-1">Press ESC or close tab to exit</p>
      </div>
    </div>
  );
};

export default AudioFloraVisualizer;