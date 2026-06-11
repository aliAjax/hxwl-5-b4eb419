import { useState, useEffect } from "react";

export function useLocalStorage<T>(key: string, initialValue: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      if (item) {
        return JSON.parse(item);
      }
      return initialValue instanceof Function ? initialValue() : initialValue;
    } catch {
      return initialValue instanceof Function ? initialValue() : initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(storedValue));
    } catch {
      // Ignore write errors
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
}

export function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocalStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore write errors
  }
}
