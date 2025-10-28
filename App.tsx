
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { synthesizeSpeech } from './services/geminiService';
import { VOICE_OPTIONS } from './constants';
import { VoiceOption } from './types';

// Helper Audio Functions
const decode = (base64: string): Uint8Array => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const decodeAudioData = async (
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number
): Promise<AudioBuffer> => {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
};

// --- UI Components (defined outside App to prevent re-creation on re-renders) ---

const SparklesIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
  </svg>
);

const PlayIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.647c1.295.742 1.295 2.545 0 3.286L7.279 20.99c-1.25.717-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
  </svg>
);

const StopIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
  </svg>
);

const Loader: React.FC = () => (
  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
);

interface SliderInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  displayValue: string;
}

const SliderInput: React.FC<SliderInputProps> = ({ label, value, min, max, step, onChange, displayValue }) => (
  <div>
    <label className="flex justify-between items-center text-sm font-medium text-gray-300">
      {label}
      <span className="px-2 py-1 text-xs rounded-md bg-gray-700">{displayValue}</span>
    </label>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-teal-500 mt-2"
    />
  </div>
);


const App: React.FC = () => {
  const [textToSpeak, setTextToSpeak] = useState('สวัสดีครับ ยินดีต้อนรับสู่ช่องของเรา');
  const [ssml, setSsml] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<string>(VOICE_OPTIONS[0].value);
  const [rate, setRate] = useState(0.7); // 70%
  const [pitch, setPitch] = useState(-3); // -3st
  
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    const prosodyRate = `${Math.round(rate * 100)}%`;
    const prosodyPitch = `${pitch}st`;
    const newSsml = `<speak><prosody rate="${prosodyRate}" pitch="${prosodyPitch}">${textToSpeak}</prosody></speak>`;
    setSsml(newSsml);
  }, [textToSpeak, rate, pitch]);
  
  const stopPlayback = useCallback(() => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
      setIsPlaying(false);
    }
  }, []);

  const handleSynthesizeAndPlay = useCallback(async () => {
    if (isLoading) return;
    stopPlayback();
    setIsLoading(true);
    setError(null);

    try {
      const base64Audio = await synthesizeSpeech(ssml, selectedVoice);
      
      if (!audioContextRef.current) {
          // Safari requires the AudioContext to be created on a user gesture
          const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
          audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }

      const audioBuffer = await decodeAudioData(
        decode(base64Audio),
        audioContextRef.current,
        24000,
        1
      );

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      source.onended = () => {
        setIsPlaying(false);
        audioSourceRef.current = null;
      };

      source.start();
      audioSourceRef.current = source;
      setIsPlaying(true);

    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  }, [ssml, selectedVoice, stopPlayback, isLoading]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans p-4 sm:p-6 lg:p-8 flex flex-col items-center">
      <div className="w-full max-w-5xl">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-500">
            Gemini TTS Studio
          </h1>
          <p className="text-gray-400 mt-2">Craft lifelike speech with SSML and Gemini.</p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Panel: Text & SSML */}
          <div className="flex flex-col gap-6 bg-gray-800/50 p-6 rounded-2xl shadow-lg border border-gray-700">
            <div>
              <label htmlFor="text-input" className="block text-lg font-semibold text-gray-200 mb-2">Text to Synthesize</label>
              <textarea
                id="text-input"
                value={textToSpeak}
                onChange={(e) => setTextToSpeak(e.target.value)}
                className="w-full h-36 p-4 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors duration-200 resize-none placeholder-gray-500"
                placeholder="Enter text here..."
              />
            </div>
            <div>
              <label htmlFor="ssml-output" className="block text-lg font-semibold text-gray-200 mb-2">Generated SSML</label>
              <textarea
                id="ssml-output"
                value={ssml}
                readOnly
                className="w-full h-36 p-4 bg-gray-900 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-colors duration-200 resize-none font-mono text-sm text-cyan-300"
              />
            </div>
          </div>

          {/* Right Panel: Controls */}
          <div className="flex flex-col justify-between gap-6 bg-gray-800/50 p-6 rounded-2xl shadow-lg border border-gray-700">
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-center text-gray-200">Voice Configuration</h2>
              <div>
                <label htmlFor="voice-select" className="block text-sm font-medium text-gray-300 mb-2">Voice Model</label>
                <select
                  id="voice-select"
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors duration-200"
                >
                  {VOICE_OPTIONS.map((option: VoiceOption) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <SliderInput 
                label="Speaking Rate"
                value={rate}
                min={0.25}
                max={1.5}
                step={0.05}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                displayValue={`${Math.round(rate * 100)}%`}
              />
              
              <SliderInput 
                label="Pitch"
                value={pitch}
                min={-20}
                max={20}
                step={1}
                onChange={(e) => setPitch(parseInt(e.target.value, 10))}
                displayValue={`${pitch}st`}
              />
            </div>
            <div className="mt-4">
              <button
                onClick={isPlaying ? stopPlayback : handleSynthesizeAndPlay}
                disabled={isLoading}
                className={`w-full flex items-center justify-center gap-3 py-4 px-6 text-lg font-semibold rounded-lg transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-opacity-50
                  ${isLoading ? 'bg-gray-600 cursor-not-allowed' : 
                    isPlaying ? 'bg-red-600 hover:bg-red-700 focus:ring-red-400' : 
                    'bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 focus:ring-cyan-400'
                  }
                `}
              >
                {isLoading ? <Loader /> : isPlaying ? <StopIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
                {isLoading ? 'Synthesizing...' : isPlaying ? 'Stop' : 'Synthesize & Play'}
              </button>
              {error && <p className="text-red-400 text-sm text-center mt-3">{error}</p>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
