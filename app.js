const startButton = document.querySelector('#start-button');
const startLabel = document.querySelector('#start-label');
const inputSelect = document.querySelector('#audio-input');
const meter = document.querySelector('#meter');
const noteElement = document.querySelector('#note');
const octaveElement = document.querySelector('#octave');
const centsElement = document.querySelector('#cents');
const frequencyElement = document.querySelector('#frequency');
const stateElement = document.querySelector('#listen-state');
const confidenceElement = document.querySelector('#confidence');
const permissionElement = document.querySelector('#permission-note');
const autoButton = document.querySelector('#auto-button');
const stringButtons = [...document.querySelectorAll('.string-note')];

const BUFFER_SIZE = 8192;
const UPDATE_INTERVAL = 70;
let audioContext;
let analyser;
let stream;
let animationFrame;
let lastUpdate = 0;
let selectedTarget = null;
let frequencyHistory = [];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function setTarget(button) {
  stringButtons.forEach(item => item.classList.toggle('active', item === button));
  autoButton.classList.toggle('active', !button);
  autoButton.setAttribute('aria-pressed', String(!button));
  selectedTarget = button ? {
    name: button.dataset.note,
    octave: Number(button.dataset.octave),
    frequency: Number(button.dataset.frequency),
  } : null;
  frequencyHistory = [];
}

function setWaiting(message = 'Play one string') {
  noteElement.textContent = selectedTarget?.name || '·';
  octaveElement.textContent = selectedTarget?.octave ?? '';
  centsElement.textContent = message;
  frequencyElement.textContent = '— Hz';
  confidenceElement.textContent = '—';
  meter.style.setProperty('--needle-left', '50%');
  meter.classList.remove('in-tune');
  stringButtons.forEach(button => button.classList.remove('detected'));
}

function updateReadout(result) {
  const level = Math.min(1, result.rms * 12);
  meter.style.setProperty('--level', `${(level * 100).toFixed(1)}%`);

  if (!result.frequency || result.confidence < 0.72) {
    stateElement.textContent = result.rms < 0.008 ? 'Listening · signal too quiet' : 'Listening · finding pitch';
    frequencyHistory = [];
    setWaiting('Play one clear note');
    return;
  }

  frequencyHistory.push(result.frequency);
  if (frequencyHistory.length > 5) frequencyHistory.shift();
  const stableFrequency = median(frequencyHistory);
  const detected = PitchTools.describeFrequency(stableFrequency);
  const target = selectedTarget || {
    name: detected.name,
    octave: detected.octave,
    frequency: detected.targetFrequency,
  };
  const cents = PitchTools.centsFromTarget(stableFrequency, target.frequency);
  const boundedCents = Math.max(-50, Math.min(50, cents));
  const inTune = Math.abs(cents) <= 5;

  noteElement.textContent = target.name;
  octaveElement.textContent = target.octave;
  frequencyElement.textContent = `${stableFrequency.toFixed(2)} Hz`;
  confidenceElement.textContent = `${Math.round(result.confidence * 100)}%`;
  meter.style.setProperty('--needle-left', `${50 + (boundedCents * 0.84)}%`);
  meter.classList.toggle('in-tune', inTune);
  stateElement.textContent = selectedTarget ? `Listening · ${target.name}${target.octave} selected` : 'Listening · auto detect';

  if (Math.abs(cents) > 50) {
    centsElement.textContent = cents < 0 ? 'More than 50¢ flat' : 'More than 50¢ sharp';
  } else if (inTune) {
    centsElement.textContent = 'In tune';
  } else {
    centsElement.textContent = `${Math.abs(cents).toFixed(1)}¢ ${cents < 0 ? 'flat' : 'sharp'}`;
  }

  stringButtons.forEach(button => {
    const isDetected = button.dataset.note === detected.name && Number(button.dataset.octave) === detected.octave;
    button.classList.toggle('detected', isDetected);
  });
}

function analyse(timestamp) {
  if (!analyser) return;
  animationFrame = requestAnimationFrame(analyse);
  if (timestamp - lastUpdate < UPDATE_INTERVAL) return;
  lastUpdate = timestamp;

  const samples = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(samples);
  updateReadout(PitchTools.detectPitch(samples, audioContext.sampleRate, {
    minFrequency: 60,
    maxFrequency: 500,
    minimumRms: 0.008,
  }));
}

async function listInputs(activeDeviceId = '') {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter(device => device.kind === 'audioinput');
  inputSelect.replaceChildren();
  inputs.forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Audio input ${index + 1}`;
    option.selected = device.deviceId === activeDeviceId;
    inputSelect.append(option);
  });
  inputSelect.disabled = inputs.length < 2;
}

async function stopListening() {
  cancelAnimationFrame(animationFrame);
  animationFrame = null;
  analyser?.disconnect();
  analyser = null;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  if (audioContext && audioContext.state !== 'closed') await audioContext.close();
  audioContext = null;
  startButton.classList.remove('listening');
  startLabel.textContent = 'Start tuning';
  stateElement.textContent = 'Ready to listen';
  permissionElement.textContent = 'Microphone stopped. No audio was stored or uploaded.';
  meter.style.setProperty('--level', '0%');
  setWaiting();
}

async function startListening(deviceId = '') {
  if (!navigator.mediaDevices?.getUserMedia) {
    permissionElement.textContent = 'Microphone access is not supported in this browser.';
    return;
  }

  if (stream) await stopListening();
  permissionElement.textContent = 'Requesting microphone access…';

  try {
    const audioConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    };
    stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    audioContext = new AudioContext({ latencyHint: 'interactive' });
    await audioContext.resume();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = BUFFER_SIZE;
    analyser.smoothingTimeConstant = 0;
    audioContext.createMediaStreamSource(stream).connect(analyser);

    const activeDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId || deviceId;
    await listInputs(activeDeviceId);
    startButton.classList.add('listening');
    startLabel.textContent = 'Stop tuning';
    stateElement.textContent = 'Listening · play a string';
    permissionElement.textContent = 'Raw audio processing is active on this device only.';
    lastUpdate = 0;
    animationFrame = requestAnimationFrame(analyse);
  } catch (error) {
    await stopListening();
    if (error.name === 'NotAllowedError') {
      permissionElement.textContent = 'Microphone permission was denied. Enable it in your browser settings and try again.';
    } else if (error.name === 'OverconstrainedError' || error.name === 'NotFoundError') {
      permissionElement.textContent = 'That audio input is unavailable. Reconnect it or choose another microphone.';
    } else {
      permissionElement.textContent = 'The microphone could not be started. Try another browser or audio input.';
    }
  }
}

startButton.addEventListener('click', () => (stream ? stopListening() : startListening(inputSelect.value)));
inputSelect.addEventListener('change', () => startListening(inputSelect.value));
autoButton.addEventListener('click', () => setTarget(null));
stringButtons.forEach(button => button.addEventListener('click', () => setTarget(button)));
navigator.mediaDevices?.addEventListener?.('devicechange', () => listInputs(inputSelect.value));
window.addEventListener('pagehide', () => stream?.getTracks().forEach(track => track.stop()));
