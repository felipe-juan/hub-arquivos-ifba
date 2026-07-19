"use strict";

function prefGet(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function prefSet(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}

function prefRemove(key) {
  try { localStorage.removeItem(key); } catch (_) {}
}

function prefGetJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function prefSetJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}
