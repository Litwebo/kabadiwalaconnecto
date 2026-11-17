import { motion, useInView, useReducedMotion } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';

interface RevealBlockProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export const RevealBlock: React.FC<RevealBlockProps> = ({
  children,
  delay = 0,
  className = '',
}) => {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{
        duration: 0.42,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

interface TiltCard3DProps {
  children: React.ReactNode;
  className?: string;
  maxTiltDeg?: number;
  sheenColor?: 'copper' | 'emerald';
  interactiveSafe?: boolean;
}

export const TiltCard3D: React.FC<TiltCard3DProps> = ({
  children,
  className = '',
  maxTiltDeg = 6,
  sheenColor = 'copper',
  interactiveSafe = false,
}) => {
  const prefersReduced = useReducedMotion();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReduced || e.pointerType !== 'mouse') return;
    if (interactiveSafe) {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('input, textarea, select')) {
        if (tilt.active) setTilt((prev) => ({ ...prev, rx: 0, ry: 0, active: false }));
        return;
      }
    }
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const ry = (px - 0.5) * maxTiltDeg * 2;
    const rx = -(py - 0.5) * maxTiltDeg * 2;
    setTilt({
      rx: Number(rx.toFixed(2)),
      ry: Number(ry.toFixed(2)),
      gx: Math.round(px * 100),
      gy: Math.round(py * 100),
      active: true,
    });
  };

  const handlePointerLeave = () => {
    setTilt((prev) => ({ ...prev, rx: 0, ry: 0, active: false }));
  };

  const sheenRgba =
    sheenColor === 'emerald' ? 'rgba(16, 185, 129, 0.42)' : 'rgba(176, 74, 23, 0.45)';

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        transform: prefersReduced
          ? undefined
          : `perspective(960px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(0)`,
        boxShadow:
          !prefersReduced && tilt.active
            ? `${-tilt.ry * 1.4}px ${tilt.rx * 1.4 + 10}px 28px -12px rgba(20, 32, 26, 0.22)`
            : undefined,
        transition: tilt.active
          ? 'transform 120ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 140ms ease'
          : 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 320ms ease',
        willChange: prefersReduced ? undefined : 'transform',
      }}
      className={`relative overflow-hidden ${className}`}
    >
      {!prefersReduced && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-200"
          style={{
            opacity: tilt.active ? 0.16 : 0,
            background: `radial-gradient(300px circle at ${tilt.gx}% ${tilt.gy}%, ${sheenRgba}, transparent 72%)`,
          }}
        />
      )}
      {children}
    </div>
  );
};

interface StageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export const StageTransition: React.FC<StageTransitionProps> = ({ children, className = '' }) => {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, rotateX: 2.5 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      style={{ transformPerspective: 1000 }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

interface StampBadge3DProps {
  icon: React.ReactNode;
  tone?: 'copper' | 'emerald';
  className?: string;
}

export const StampBadge3D: React.FC<StampBadge3DProps> = ({
  icon,
  tone = 'copper',
  className = '',
}) => {
  const prefersReduced = useReducedMotion();
  const gradient =
    tone === 'emerald'
      ? 'from-emerald-500 via-emerald-600 to-emerald-800 shadow-emerald-900/30'
      : 'from-[#d9692b] via-[#b04a17] to-[#7c300b] shadow-[#7c300b]/35';

  return (
    <div
      aria-hidden="true"
      className={`perspective-stage inline-flex items-center justify-center shrink-0 ${className}`}
    >
      <div
        className={`relative w-11 h-11 rounded-2xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shadow-lg ${
          prefersReduced ? '' : 'seal-3d-float'
        }`}
      >
        <div
          className="absolute inset-0.5 rounded-[14px] border border-white/25 pointer-events-none"
          style={{ transform: 'translateZ(6px)' }}
        />
        <div style={{ transform: 'translateZ(12px)' }}>{icon}</div>
      </div>
    </div>
  );
};

interface AnimatedNumberProps {
  value: number;
  durationMs?: number;
  format?: (val: number) => string;
  className?: string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  durationMs = 650,
  format = (v) => Math.round(v).toLocaleString('en-IN'),
  className = '',
}) => {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const [display, setDisplay] = useState<number>(value);
  const previousRef = useRef<number>(0);

  useEffect(() => {
    if (prefersReduced) {
      setDisplay(value);
      previousRef.current = value;
      return;
    }
    if (!inView) return;

    const startVal = previousRef.current;
    const endVal = value;
    const startTime = performance.now();
    let rafId = 0;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = startVal + (endVal - startVal) * eased;
      setDisplay(current);
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        previousRef.current = endVal;
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [value, durationMs, inView, prefersReduced]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {format(display)}
    </span>
  );
};
