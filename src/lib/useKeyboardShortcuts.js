import { useEffect, useRef } from "react";

function isEditableTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Global keyboard shortcuts hook using a single stable window `keydown` listener.
 * Character shortcuts automatically ignore focus inside inputs/textareas/selects/contentEditable
 * and modified chords (Ctrl/Meta/Alt), while `Escape` always dispatches so active modals close.
 *
 * @param {Record<string, (e: KeyboardEvent) => void>} handlers
 * @param {{ enabled?: boolean, ignoreInputs?: boolean, allowModifiers?: boolean }} [options]
 */
export function useKeyboardShortcuts(handlers, options = {}) {
  const {
    enabled = true,
    ignoreInputs = true,
    allowModifiers = false,
  } = options;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const onKeyDown = (e) => {
      const map = handlersRef.current;
      if (!map) return;

      const rawKey = String(e.key || "");
      if (!rawKey) return;

      if (!allowModifiers && (e.ctrlKey || e.metaKey || e.altKey)) {
        return;
      }

      const isEscape = rawKey === "Escape" || rawKey === "Esc";
      if (ignoreInputs && !isEscape && isEditableTarget(e.target)) {
        return;
      }

      const handler = map[rawKey] || map[rawKey.toLowerCase()];
      if (typeof handler === "function") {
        handler(e);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, ignoreInputs, allowModifiers]);
}
