import { useEffect, useRef, useState } from "react";

export default function ScrollStatement({ text }) {
  const ref = useRef(null);
  const words = text.split(" ");
  const [litCount, setLitCount] = useState(0);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const progress = Math.min(
        1,
        Math.max(0, (window.innerHeight * 0.85 - r.top) / (r.height + window.innerHeight * 0.3)),
      );
      const nextLit = Math.ceil(progress * words.length);
      setLitCount((cur) => (cur === nextLit ? cur : nextLit));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
    };
  }, [words.length]);

  return (
    <section className="scroll-statement" ref={ref}>
      <div className="container-xl">
        <h2 className="font-display">
          {words.map((w, i) => (
            <span key={i} className={i < litCount ? "lit" : ""}>
              {w}{" "}
            </span>
          ))}
        </h2>
      </div>
    </section>
  );
}
