import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface InfoIconProps {
  text: string;
}

const MOBILE_QUERY = '(max-width: 768px)';

export function InfoIcon({ text }: InfoIconProps) {
  const [show, setShow] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [side, setSide] = useState<'left' | 'right'>('right');
  // Desktop: fixed viewport coords computed from the icon's rect so the portaled
  // tooltip never clips against ancestor overflow (e.g. .section's overflow:hidden).
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
  );
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Auto-detect tooltip side when shown. Requires a live DOM measurement
  // (getBoundingClientRect) so it cannot be derived during render.
  useEffect(() => {
    if (!show || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const goLeft = rect.right + 300 > window.innerWidth;
    const TOOLTIP_WIDTH = 280;
    const GAP = 10;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- positions tooltip from a live DOM measurement; can't be derived during render
    setSide(goLeft ? 'left' : 'right');
    setCoords({
      top: rect.top - 8,
      left: goLeft ? rect.left - TOOLTIP_WIDTH - GAP : rect.right + GAP,
    });
  }, [show]);

  // Close when clicking outside
  useEffect(() => {
    if (!pinned) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current && wrapperRef.current.contains(target)) return;
      // Also ignore clicks on the portaled tooltip itself — it handles its own close.
      const tooltipEl = document.querySelector('.info-tooltip');
      if (tooltipEl && tooltipEl.contains(target)) return;
      setPinned(false);
      setShow(false);
    };

    // Small delay to avoid the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('touchend', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('touchend', handleClickOutside);
    };
  }, [pinned]);

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (pinned) {
      // Close if already pinned
      setPinned(false);
      setShow(false);
    } else {
      // Pin it open
      setPinned(true);
      setShow(true);
    }
  };

  const handleMouseEnter = () => {
    if (!pinned) {
      setShow(true);
    }
  };

  const handleMouseLeave = () => {
    if (!pinned) {
      setShow(false);
    }
  };

  const handleClose = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setPinned(false);
    setShow(false);
  };

  // Desktop waits for measured coords so it doesn't flash at the page origin.
  const tooltip = show && (isMobile || coords) ? (
    <div
      className={`info-tooltip${side === 'left' ? ' info-tooltip-left' : ''}`}
      style={!isMobile && coords ? { position: 'fixed', top: coords.top, left: coords.left, right: 'auto' } : undefined}
      onClick={handleClose}
      onTouchEnd={handleClose}
    >
      {text}
      <span className="info-tooltip-close">tap to close</span>
    </div>
  ) : null;

  return (
    <span className="info-icon-wrapper" ref={wrapperRef}>
      <span
        className={`info-icon${pinned ? ' info-icon-active' : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onTouchEnd={handleClick}
      >
        i
      </span>
      {/* Always portal to <body>: on desktop with fixed coords, on mobile with
          CSS viewport anchoring. Ancestors with overflow:hidden (e.g. .section)
          or a containing block (backdrop-filter) would otherwise clip/trap it. */}
      {tooltip && createPortal(tooltip, document.body)}
    </span>
  );
}
