import { useEffect, useRef } from "react";

export default function ScrollProgress() {
  const barRef = useRef(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const bar = barRef.current;
      if (!bar) return;
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight || 1;
      const ratio = Math.min(1, Math.max(0, h.scrollTop / max));
      bar.style.transform = `scaleX(${ratio})`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div
      className="fixed top-0 left-0 right-0 h-[2px] z-[60] pointer-events-none overflow-hidden"
      data-testid="scroll-progress"
    >
      <div
        ref={barRef}
        className="h-full w-full origin-left bg-gradient-to-r from-[var(--accent)] via-[#6ee7b7] to-[var(--accent)]"
        style={{ transform: "scaleX(0)", willChange: "transform" }}
      />
    </div>
  );
}
