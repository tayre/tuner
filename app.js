const startButton = document.querySelector('#start-button');
const note = document.querySelector('#note');
const frequency = document.querySelector('#frequency');
const caption = document.querySelector('#dial-caption');
const permission = document.querySelector('#permission-note');
const noteButtons = document.querySelectorAll('.string-note');

startButton.addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    permission.textContent = 'Microphone access is not supported in this browser.';
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    startButton.innerHTML = '<span class="button-dot"></span>Listening';
    note.textContent = '♪';
    frequency.textContent = 'Microphone connected';
    caption.textContent = 'Listening — play one string clearly.';
    permission.textContent = 'Pitch detection is coming next.';
  } catch {
    permission.textContent = 'Microphone permission was not granted.';
  }
});

noteButtons.forEach(button => button.addEventListener('click', () => {
  noteButtons.forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  note.textContent = button.dataset.note.slice(0, -1);
  frequency.textContent = `${button.dataset.frequency} Hz · reference note`;
  caption.textContent = `Reference pitch for the ${button.dataset.note} string.`;
}));
