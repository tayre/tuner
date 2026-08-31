const assert = require('node:assert/strict');
const {
  centsFromTarget,
  describeFrequency,
  detectPitch,
} = require('../pitch-detector.js');

const SAMPLE_RATE = 48000;
const BUFFER_SIZE = 8192;

function tone(frequency, { amplitude = 0.45, noise = 0, harmonics = [] } = {}) {
  let seed = 123456789;
  const samples = new Float32Array(BUFFER_SIZE);
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / SAMPLE_RATE;
    let value = amplitude * Math.sin(2 * Math.PI * frequency * time);
    harmonics.forEach(([multiple, gain]) => {
      value += amplitude * gain * Math.sin(2 * Math.PI * frequency * multiple * time);
    });
    seed = (1664525 * seed + 1013904223) >>> 0;
    value += noise * ((seed / 0xffffffff) - 0.5);
    samples[index] = value;
  }
  return samples;
}

for (const frequency of [82.4069, 110, 146.8324, 195.9977, 246.9417, 329.6276]) {
  const result = detectPitch(tone(frequency), SAMPLE_RATE);
  assert.ok(result.frequency, `expected ${frequency} Hz to be detected`);
  assert.ok(Math.abs(centsFromTarget(result.frequency, frequency)) < 0.5, `expected ${frequency} Hz within 0.5 cents, got ${result.frequency}`);
  assert.ok(result.confidence > 0.95, `expected high confidence for ${frequency} Hz`);
}

const guitarLike = detectPitch(tone(82.4069, {
  amplitude: 0.28,
  noise: 0.015,
  harmonics: [[2, 0.55], [3, 0.28], [4, 0.12]],
}), SAMPLE_RATE);
assert.ok(Math.abs(centsFromTarget(guitarLike.frequency, 82.4069)) < 1.5, 'expected noisy harmonic E2 within 1.5 cents');

const quiet = detectPitch(tone(110, { amplitude: 0.001 }), SAMPLE_RATE);
assert.equal(quiet.frequency, null, 'expected a very quiet signal to be rejected');

assert.deepEqual(
  (({ name, octave }) => ({ name, octave }))(describeFrequency(440)),
  { name: 'A', octave: 4 },
);

console.log('Pitch detector tests passed.');
