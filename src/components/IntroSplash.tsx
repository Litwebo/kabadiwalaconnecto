import { ArrowRight, Play, Volume2, VolumeX } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import heroPoster from '../assets/images/hero_ewaste_hub_1794898241189.jpg';

interface IntroSplashProps {
  onComplete: () => void;
}

export const IntroSplash: React.FC<IntroSplashProps> = ({ onComplete }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const completedRef = useRef(false);
  const [isMuted, setIsMuted] = useState(true);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(0);

  const finishIntro = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setExiting(true);
    window.setTimeout(() => {
      onComplete();
    }, 220);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        setAutoplayBlocked(true);
      });
    }
  }, []);

  const handleManualPlay = () => {
    const video = videoRef.current;
    if (!video) return;
    setAutoplayBlocked(false);
    video.play().catch(() => {
      finishIntro();
    });
  };

  const handleToggleMute = () => {
    const video = videoRef.current;
    const next = !isMuted;
    if (video) {
      video.muted = next;
    }
    setIsMuted(next);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !video.duration || Number.isNaN(video.duration)) return;
    setProgress(Math.min(100, (video.currentTime / video.duration) * 100));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kabadiwala Connect introduction video"
      className={`fixed inset-0 z-50 bg-[#070d0a] flex flex-col items-center justify-center overflow-hidden transition-opacity duration-200 ${
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <video
        ref={videoRef}
        src="/assets/aistudio/Generate_website_recycling_intro__3e0fcd85_3057ff0c.mp4"
        poster={heroPoster}
        autoPlay
        muted={isMuted}
        playsInline
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onEnded={finishIntro}
        onError={finishIntro}
        className="w-full h-full object-contain md:object-cover"
      />

      {/* Top Controls Bar */}
      <div className="absolute inset-x-0 top-0 p-4 sm:p-6 flex items-center justify-between gap-3 bg-gradient-to-b from-black/75 via-black/30 to-transparent">
        <div className="font-mono text-xs sm:text-sm font-semibold tracking-wider text-white/90 uppercase">
          Kabadiwala Connect
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={isMuted ? 'Unmute intro audio' : 'Mute intro audio'}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 backdrop-blur-md transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={finishIntro}
            className="min-h-[44px] px-4 py-2 rounded-full bg-black/65 hover:bg-black/85 text-white border border-white/20 backdrop-blur-md text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <span>Skip Intro</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Fallback Play Trigger if browser blocks autoplay */}
      {autoplayBlocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/55 backdrop-blur-xs p-6">
          <button
            type="button"
            onClick={handleManualPlay}
            className="min-h-[52px] px-6 py-3 rounded-full bg-[#b04a17] hover:bg-[#943b10] text-white font-semibold text-base inline-flex items-center gap-2 shadow-lg transition-colors"
          >
            <Play className="w-5 h-5" />
            <span>Play Intro</span>
          </button>
          <button
            type="button"
            onClick={finishIntro}
            className="text-sm text-white/80 hover:text-white underline"
          >
            Enter Website Directly
          </button>
        </div>
      )}

      {/* Subtle Bottom Progress Bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-white/15">
        <div
          className="h-full bg-[#b04a17] transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
