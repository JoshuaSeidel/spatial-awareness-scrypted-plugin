# Changelog

## 0.6.33 - 2026-01-23

### Added
- Optional notifications on alert updates with cooldown control.
- Minimum detection confidence setting to reduce noise.
- Alert update coalescing to keep one alert per object.
- Debounced tracking state persistence and periodic cleanup for efficiency.

### Changed
- Movement alerts now update in place during cooldown instead of creating new alerts.
- Reused cached snapshots for notifications when available.
- LLM rate limiting is skipped when LLM is disabled.

### Fixed
- Avoided stale loitering alerts after cross-camera transitions.
- Cancelled pending loitering timers on exits and lost tracking.
