/**
 * Object Correlator
 * Matches objects across cameras using multi-factor scoring
 */

import {
  CameraTopology,
  CameraConnection,
  findConnection,
  ClipPath,
} from '../models/topology';
import {
  TrackedObject,
  ObjectSighting,
  CorrelationCandidate,
  CorrelationFactors,
  getLastSighting,
} from '../models/tracked-object';
import { TrackingEngineConfig } from './tracking-engine';

export class ObjectCorrelator {
  private topology: CameraTopology;
  private config: TrackingEngineConfig;

  constructor(topology: CameraTopology, config: TrackingEngineConfig) {
    this.topology = topology;
    this.config = config;
  }

  /**
   * Find best matching tracked object for a new sighting
   * Returns null if no suitable match found
   */
  async findBestMatch(
    sighting: ObjectSighting,
    activeObjects: TrackedObject[]
  ): Promise<CorrelationCandidate | null> {
    const candidates: CorrelationCandidate[] = [];

    for (const tracked of activeObjects) {
      const candidate = await this.evaluateCandidate(tracked, sighting);

      // Only consider if above threshold
      if (candidate.confidence >= this.config.correlationThreshold) {
        candidates.push(candidate);
      }
    }

    if (candidates.length === 0) return null;

    // Sort by confidence (highest first)
    candidates.sort((a, b) => b.confidence - a.confidence);

    // Return best match
    return candidates[0];
  }

  /**
   * Evaluate correlation confidence between tracked object and new sighting
   */
  private async evaluateCandidate(
    tracked: TrackedObject,
    sighting: ObjectSighting
  ): Promise<CorrelationCandidate> {
    const factors: CorrelationFactors = {
      timing: this.evaluateTimingFactor(tracked, sighting),
      visual: await this.evaluateVisualFactor(tracked, sighting),
      spatial: this.evaluateSpatialFactor(tracked, sighting),
      class: this.evaluateClassFactor(tracked, sighting),
    };

    // Calculate weighted confidence
    // Class mismatch is a hard veto
    if (factors.class === 0) {
      return {
        trackedObject: tracked,
        newSighting: sighting,
        confidence: 0,
        factors,
      };
    }

    // Timing completely off is also a veto
    if (factors.timing === 0) {
      return {
        trackedObject: tracked,
        newSighting: sighting,
        confidence: 0,
        factors,
      };
    }

    // Weighted combination:
    // - Timing: 30% - Transit time matches expected range
    // - Visual: 35% - Embedding similarity
    // - Spatial: 25% - Exit/entry zone coherence
    // - Class: 10% - Object class match (already vetoed if 0)
    const confidence =
      factors.timing * 0.30 +
      factors.visual * 0.35 +
      factors.spatial * 0.25 +
      factors.class * 0.10;

    return {
      trackedObject: tracked,
      newSighting: sighting,
      confidence,
      factors,
    };
  }

  /**
   * Evaluate timing-based correlation
   * High score if transit time matches expected range
   */
  private evaluateTimingFactor(
    tracked: TrackedObject,
    sighting: ObjectSighting
  ): number {
    const lastSighting = getLastSighting(tracked);
    if (!lastSighting) return 0;

    // Same camera - always good timing
    if (lastSighting.cameraId === sighting.cameraId) {
      return 1.0;
    }

    // Find connection between cameras
    const connection = findConnection(
      this.topology,
      lastSighting.cameraId,
      sighting.cameraId
    );

    if (!connection) {
      // No defined connection - low score but not zero
      // (allows for uncharted paths)
      return 0.2;
    }

    const transitTime = sighting.timestamp - lastSighting.timestamp;
    const { min, typical, max } = connection.transitTime;

    // Way outside range
    if (transitTime < min * 0.5 || transitTime > max * 2) {
      return 0;
    }

    // Slightly outside range
    if (transitTime < min || transitTime > max) {
      if (transitTime < min) {
        return 0.3 * (transitTime / min);
      }
      return 0.3 * (max / transitTime);
    }

    // Within range - score based on proximity to typical
    const deviation = Math.abs(transitTime - typical);
    const range = (max - min) / 2;

    if (range === 0) return 1.0;

    return Math.max(0.5, 1 - (deviation / range) * 0.5);
  }

  /**
   * Evaluate visual similarity using embeddings
   */
  private async evaluateVisualFactor(
    tracked: TrackedObject,
    sighting: ObjectSighting
  ): Promise<number> {
    // If visual matching is disabled, return neutral score
    if (!this.config.useVisualMatching) {
      return 0.5;
    }

    // No embeddings available
    if (!tracked.visualDescriptor || !sighting.embedding) {
      return 0.5; // Neutral - don't penalize or reward
    }

    try {
      // Calculate cosine similarity between embeddings
      const similarity = this.cosineSimilarity(
        tracked.visualDescriptor,
        sighting.embedding
      );

      // Convert similarity [-1, 1] to score [0, 1]
      return (similarity + 1) / 2;
    } catch (e) {
      return 0.5;
    }
  }

  /**
   * Evaluate spatial coherence (exit zone -> entry zone match)
   */
  private evaluateSpatialFactor(
    tracked: TrackedObject,
    sighting: ObjectSighting
  ): number {
    const lastSighting = getLastSighting(tracked);
    if (!lastSighting) return 0.5;

    // Same camera - full spatial coherence
    if (lastSighting.cameraId === sighting.cameraId) {
      return 1.0;
    }

    // Find connection
    const connection = findConnection(
      this.topology,
      lastSighting.cameraId,
      sighting.cameraId
    );

    if (!connection) {
      return 0.3; // No connection defined
    }

    let score = 0;

    // Check if last detection was in/near exit zone
    if (lastSighting.position && connection.exitZone.length > 0) {
      const inExitZone = this.isPointNearZone(
        lastSighting.position,
        connection.exitZone,
        0.2 // 20% tolerance
      );
      if (inExitZone) score += 0.5;
    } else {
      score += 0.25; // No position data - give partial credit
    }

    // Check if new detection is in/near entry zone
    if (sighting.position && connection.entryZone.length > 0) {
      const inEntryZone = this.isPointNearZone(
        sighting.position,
        connection.entryZone,
        0.2
      );
      if (inEntryZone) score += 0.5;
    } else {
      score += 0.25;
    }

    return score;
  }

  /**
   * Evaluate object class match
   */
  private evaluateClassFactor(
    tracked: TrackedObject,
    sighting: ObjectSighting
  ): number {
    // Exact match
    if (tracked.className === sighting.detection.className) {
      return 1.0;
    }

    // Similar classes (e.g., 'car' and 'vehicle')
    const similarClasses: Record<string, string[]> = {
      car: ['vehicle', 'truck', 'suv'],
      vehicle: ['car', 'truck', 'suv'],
      truck: ['vehicle', 'car'],
      person: ['human'],
      human: ['person'],
    };

    const similar = similarClasses[tracked.className] || [];
    if (similar.includes(sighting.detection.className)) {
      return 0.8;
    }

    // Class mismatch
    return 0;
  }

  /**
   * Calculate cosine similarity between two base64-encoded embeddings
   */
  private cosineSimilarity(embedding1: string, embedding2: string): number {
    try {
      const vec1 = this.decodeEmbedding(embedding1);
      const vec2 = this.decodeEmbedding(embedding2);

      if (vec1.length !== vec2.length || vec1.length === 0) {
        return 0;
      }

      let dotProduct = 0;
      let mag1 = 0;
      let mag2 = 0;

      for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        mag1 += vec1[i] * vec1[i];
        mag2 += vec2[i] * vec2[i];
      }

      mag1 = Math.sqrt(mag1);
      mag2 = Math.sqrt(mag2);

      if (mag1 === 0 || mag2 === 0) return 0;

      return dotProduct / (mag1 * mag2);
    } catch (e) {
      return 0;
    }
  }

  /**
   * Decode base64 embedding to float array
   */
  private decodeEmbedding(base64: string): number[] {
    try {
      const buffer = Buffer.from(base64, 'base64');
      const floats: number[] = [];

      for (let i = 0; i < buffer.length; i += 4) {
        floats.push(buffer.readFloatLE(i));
      }

      return floats;
    } catch (e) {
      return [];
    }
  }

  /**
   * Check if a point is near/inside a polygon zone
   */
  private isPointNearZone(
    point: { x: number; y: number },
    zone: ClipPath,
    tolerance: number
  ): boolean {
    if (zone.length < 3) return false;

    // Convert normalized point to zone coordinates (0-100)
    const px = point.x * 100;
    const py = point.y * 100;

    // Point in polygon test (ray casting)
    let inside = false;
    for (let i = 0, j = zone.length - 1; i < zone.length; j = i++) {
      const xi = zone[i][0];
      const yi = zone[i][1];
      const xj = zone[j][0];
      const yj = zone[j][1];

      if (
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
      ) {
        inside = !inside;
      }
    }

    if (inside) return true;

    // Check if near the zone (within tolerance)
    for (const vertex of zone) {
      const dx = Math.abs(px - vertex[0]) / 100;
      const dy = Math.abs(py - vertex[1]) / 100;
      if (dx < tolerance && dy < tolerance) {
        return true;
      }
    }

    return false;
  }
}
