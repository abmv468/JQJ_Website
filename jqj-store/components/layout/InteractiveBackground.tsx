"use client";

import { useEffect } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";

export default function InteractiveBackground() {
  const shouldReduceMotion = useReducedMotion();
  const pointerX = useMotionValue(50);
  const pointerY = useMotionValue(28);

  const smoothX = useSpring(pointerX, { stiffness: 140, damping: 26, mass: 0.4 });
  const smoothY = useSpring(pointerY, { stiffness: 140, damping: 26, mass: 0.4 });

  const secondaryX = useTransform(smoothX, (value) => 100 - value * 0.7);
  const secondaryY = useTransform(smoothY, (value) => 100 - value * 0.6);

  const { scrollYProgress } = useScroll();
  const scrollShift = useTransform(scrollYProgress, [0, 1], [0, 18]);
  const deepLayerY = useTransform(scrollYProgress, [0, 1], [0, -80]);

  const heroAura = useMotionTemplate`radial-gradient(42rem 42rem at ${smoothX}% ${smoothY}%, rgba(24, 81, 74, 0.35), transparent 72%), radial-gradient(34rem 34rem at ${secondaryX}% ${secondaryY}%, rgba(187, 157, 123, 0.16), transparent 74%), linear-gradient(180deg, rgba(1,1,1,1) 0%, rgba(4,12,12,1) 100%)`;
  const grainShift = useMotionTemplate`radial-gradient(26rem 26rem at ${smoothX}% ${scrollShift}%, rgba(255,255,255,0.05), transparent 70%)`;

  useEffect(() => {
    if (shouldReduceMotion) return;

    const handleMouseMove = (event: MouseEvent) => {
      const x = (event.clientX / window.innerWidth) * 100;
      const y = (event.clientY / window.innerHeight) * 100;
      pointerX.set(x);
      pointerY.set(y);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [pointerX, pointerY, shouldReduceMotion]);

  if (shouldReduceMotion) {
    return <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-brand-bg" />;
  }

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <motion.div className="absolute inset-0" style={{ backgroundImage: heroAura }} />
      <motion.div
        className="absolute inset-0 opacity-55"
        style={{ backgroundImage: grainShift, y: deepLayerY }}
      />
    </div>
  );
}
