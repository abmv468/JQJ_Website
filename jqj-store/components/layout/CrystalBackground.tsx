"use client";

import {
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";

export default function CrystalBackground() {
  const { scrollYProgress } = useScroll();
  const shouldReduceMotion = useReducedMotion();
  const atmosphereY = useTransform(scrollYProgress, [0, 1], ["-4%", "8%"]);
  const orbY = useTransform(scrollYProgress, [0, 1], ["-2%", "12%"]);
  const mistNearY = useTransform(scrollYProgress, [0, 1], ["-8%", "14%"]);
  const mistFarY = useTransform(scrollYProgress, [0, 1], ["-3%", "9%"]);
  const mistX = useTransform(scrollYProgress, [0, 1], ["-4%", "6%"]);
  const smokeRotate = useTransform(scrollYProgress, [0, 1], [-2, 4]);
  const smokeY = useTransform(scrollYProgress, [0, 1], ["2%", "-9%"]);

  return (
    <LazyMotion features={domAnimation}>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_550px_at_12%_-10%,rgba(24,76,82,0.4),transparent_65%),radial-gradient(1100px_600px_at_88%_10%,rgba(187,157,123,0.2),transparent_68%),linear-gradient(180deg,#010101_0%,#020607_55%,#010101_100%)]" />

        <m.div
          className="absolute -left-[30%] top-[-15%] h-[140%] w-[60%] rotate-12 bg-[linear-gradient(110deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.05)_35%,rgba(255,255,255,0.28)_50%,rgba(255,255,255,0.05)_65%,rgba(255,255,255,0)_100%)] blur-3xl"
          style={shouldReduceMotion ? undefined : { y: atmosphereY }}
          animate={shouldReduceMotion ? undefined : { x: ["-25%", "120%"] }}
          transition={{
            duration: 28,
            repeat: Number.POSITIVE_INFINITY,
            repeatType: "mirror",
            ease: "easeInOut",
          }}
        />

        <m.div
          className="absolute right-[-16rem] top-[-10rem] h-[26rem] w-[26rem] rounded-full bg-[#184C52]/20 blur-3xl"
          style={shouldReduceMotion ? undefined : { y: orbY }}
          animate={shouldReduceMotion ? undefined : { x: ["0%", "-18%", "0%"] }}
          transition={{
            duration: 36,
            repeat: Number.POSITIVE_INFINITY,
            repeatType: "mirror",
            ease: "easeInOut",
          }}
        />

        <m.div
          className="absolute -left-[22%] top-[16%] h-[52%] w-[78%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(174,208,216,0.17),rgba(174,208,216,0)_70%)] blur-[65px] mix-blend-screen"
          style={shouldReduceMotion ? undefined : { y: mistNearY, x: mistX }}
          animate={shouldReduceMotion ? undefined : { x: ["-6%", "10%", "-4%"] }}
          transition={{
            duration: 30,
            repeat: Number.POSITIVE_INFINITY,
            repeatType: "mirror",
            ease: "easeInOut",
          }}
        />

        <m.div
          className="absolute right-[-18%] bottom-[-8%] h-[48%] w-[74%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(187,157,123,0.14),rgba(187,157,123,0)_72%)] blur-[72px] mix-blend-screen"
          style={shouldReduceMotion ? undefined : { y: mistFarY }}
          animate={shouldReduceMotion ? undefined : { x: ["8%", "-12%", "6%"] }}
          transition={{
            duration: 34,
            repeat: Number.POSITIVE_INFINITY,
            repeatType: "mirror",
            ease: "easeInOut",
          }}
        />

        <m.div
          className="absolute left-[-18%] bottom-[-24%] h-[82%] w-[140%] bg-[radial-gradient(ellipse_at_30%_60%,rgba(255,255,255,0.08),rgba(255,255,255,0)_58%),radial-gradient(ellipse_at_74%_44%,rgba(149,193,202,0.11),rgba(149,193,202,0)_62%)] blur-[86px] mix-blend-soft-light"
          style={
            shouldReduceMotion
              ? undefined
              : { y: smokeY, rotate: smokeRotate, transformOrigin: "50% 60%" }
          }
          animate={shouldReduceMotion ? undefined : { x: ["-3%", "4%", "-2%"] }}
          transition={{
            duration: 40,
            repeat: Number.POSITIVE_INFINITY,
            repeatType: "mirror",
            ease: "easeInOut",
          }}
        />
      </div>
    </LazyMotion>
  );
}
