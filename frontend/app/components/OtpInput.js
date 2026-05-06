'use client';

import { useEffect, useRef } from 'react';

// 6 single-digit cells with auto-advance, backspace, paste support.
export default function OtpInput({ value = '', onChange, length = 6, autoFocus = true, disabled = false }) {
  const refs = useRef([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function setAt(idx, digit) {
    const arr = String(value || '').slice(0, length).split('');
    while (arr.length < length) arr.push('');
    arr[idx] = digit;
    onChange(arr.join('').slice(0, length));
  }

  function handleChange(idx, e) {
    const v = e.target.value.replace(/\D/g, '');
    if (!v) {
      setAt(idx, '');
      return;
    }
    if (v.length === 1) {
      setAt(idx, v);
      if (idx < length - 1) refs.current[idx + 1]?.focus();
      return;
    }
    // Pasting / autofill of multiple digits
    const digits = v.slice(0, length).split('');
    const arr = String(value || '').slice(0, length).split('');
    while (arr.length < length) arr.push('');
    let cursor = idx;
    for (const d of digits) {
      if (cursor >= length) break;
      arr[cursor] = d;
      cursor++;
    }
    onChange(arr.join('').slice(0, length));
    refs.current[Math.min(cursor, length - 1)]?.focus();
  }

  function handleKeyDown(idx, e) {
    if (e.key === 'Backspace') {
      if (!value[idx] && idx > 0) {
        refs.current[idx - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      refs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      refs.current[idx + 1]?.focus();
    }
  }

  function handlePaste(e) {
    const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
    if (!text) return;
    e.preventDefault();
    onChange(text.slice(0, length));
    refs.current[Math.min(text.length, length - 1)]?.focus();
  }

  return (
    <div className="flex justify-between gap-2" onPaste={handlePaste}>
      {Array.from({ length }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => (refs.current[idx] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={value[idx] || ''}
          onChange={(e) => handleChange(idx, e)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          className="h-12 w-10 rounded-md border border-slate-300 bg-white text-center font-mono text-lg font-bold text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:bg-slate-50"
        />
      ))}
    </div>
  );
}
