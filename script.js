const gameData = {
  A: ['Apple', 'Ant', 'Aeroplane'],
  B: ['Ball', 'Banana', 'Bat'],
  C: ['Cat', 'Car', 'Cake'],
  D: ['Dog', 'Duck', 'Dolphin'],
  E: ['Elephant', 'Eagle', 'Egg'],
  F: ['Fish', 'Fox', 'Flower'],
  G: ['Giraffe', 'Grapes', 'Guitar'],
  H: ['House', 'Horse', 'Hat'],
  I: ['Ice cream', 'Igloo', 'Insect'],
  J: ['Juice', 'Jacket', 'Jellyfish']
};

const levelConfig = [
  { letters: 3, words: 3 },
  { letters: 5, words: 3 },
  { letters: 7, words: 4 },
  { letters: 10, words: 4 }
];

const state = { level: 0, score: 0, combo: 0, matched: new Map(), words: [], letters: [], hints: 3, startedAt: 0, pausedAt: 0, elapsedBeforePause: 0, timerId: null, dragging: null, completed: false };
const elements = {
  letterList: document.querySelector('#letterList'), wordList: document.querySelector('#wordList'), lineLayer: document.querySelector('#lineLayer'), previewLine: document.querySelector('#previewLine'), boardWrap: document.querySelector('#boardWrap'), connections: document.querySelector('#connections'), feedback: document.querySelector('#feedback'), score: document.querySelector('#scoreValue'), timer: document.querySelector('#timerValue'), level: document.querySelector('#levelValue'), progress: document.querySelector('#progressText'), progressBar: document.querySelector('#progressBar'), wordCount: document.querySelector('#wordCount'), combo: document.querySelector('#comboValue'), comboStat: document.querySelector('#comboStat'), hintsLeft: document.querySelector('#hintsLeft'), pauseButton: document.querySelector('#pauseButton'), pauseOverlay: document.querySelector('#pauseOverlay'), completionOverlay: document.querySelector('#completionOverlay'), finalScore: document.querySelector('#finalScore'), finalMatches: document.querySelector('#finalMatches'), finalTime: document.querySelector('#finalTime')
};

function shuffle(items) { return [...items].sort(() => Math.random() - 0.5); }
function formatTime(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function currentSeconds() { return Math.floor((Date.now() - state.startedAt) / 1000) + state.elapsedBeforePause; }
function playTone(correct) {
  try {
    const audio = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audio.createOscillator(); const gain = audio.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = correct ? 640 : 180; gain.gain.setValueAtTime(.08, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .22);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .22);
  } catch (error) { /* Audio is optional in browsers that block it. */ }
}

function setupLevel() {
  clearInterval(state.timerId); state.matched.clear(); state.completed = false; state.combo = 0; state.hints = 3; state.elapsedBeforePause = 0; state.startedAt = Date.now();
  const config = levelConfig[state.level]; state.letters = shuffle(Object.keys(gameData)).slice(0, config.letters);
  state.words = shuffle(state.letters.flatMap(letter => gameData[letter].slice(0, config.words).map(word => ({ word, letter }))));
  elements.level.textContent = String(state.level + 1).padStart(2, '0'); elements.hintsLeft.textContent = state.hints; elements.wordCount.textContent = `${state.words.length} words`; elements.pauseOverlay.hidden = true; elements.completionOverlay.hidden = true;
  renderBoard(); updateStats(); state.timerId = setInterval(updateTimer, 1000);
}

function renderBoard() {
  elements.letterList.innerHTML = state.letters.map(letter => `<div class="letter-card" data-letter="${letter}" role="button" tabindex="0" aria-label="Letter ${letter}">${letter}</div>`).join('');
  elements.wordList.innerHTML = state.words.map(({ word, letter }) => `<div class="word-card" data-word="${word}" data-letter="${letter}" role="button" tabindex="0">${word}</div>`).join('');
  elements.letterList.querySelectorAll('.letter-card').forEach(card => { card.addEventListener('pointerdown', startDrag); card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') startDrag(event); }); });
  window.requestAnimationFrame(drawMatches);
}

function getPoint(event) {
  const rect = elements.connections.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function getCardPoint(card, side) { const cardRect = card.getBoundingClientRect(); const svgRect = elements.connections.getBoundingClientRect(); return { x: (side === 'right' ? cardRect.right : cardRect.left) - svgRect.left, y: cardRect.top + cardRect.height / 2 - svgRect.top }; }
function startDrag(event) {
  event.preventDefault(); if (state.completed) return;
  const source = event.currentTarget; const letter = source.dataset.letter; state.dragging = { letter, source, pointerId: event.pointerId };
  source.classList.add('active');
  if (event.pointerId !== undefined) source.setPointerCapture?.(event.pointerId);
  document.addEventListener('pointermove', moveDrag);
  document.addEventListener('pointerup', finishDrag, { once: true });
  document.addEventListener('pointercancel', finishDrag, { once: true });
  updatePreview(event);
}
function moveDrag(event) { if (state.dragging) { event.preventDefault(); updatePreview(event); } }
function updatePreview(event) { const start = getCardPoint(state.dragging.source, 'right'); const end = getPoint(event); const curve = Math.max(45, (end.x - start.x) * .45); elements.previewLine.setAttribute('d', `M ${start.x} ${start.y} C ${start.x + curve} ${start.y}, ${end.x - curve} ${end.y}, ${end.x} ${end.y}`); }
function finishDrag(event) {
  if (!state.dragging) return; const drag = state.dragging; state.dragging = null; document.removeEventListener('pointermove', moveDrag); document.removeEventListener('pointercancel', finishDrag); drag.source.releasePointerCapture?.(drag.pointerId); drag.source.classList.remove('active'); elements.previewLine.setAttribute('d', '');
  const target = [...document.elementsFromPoint(event.clientX, event.clientY)].map(element => element.closest?.('.word-card')).find(Boolean); if (!target || target.classList.contains('matched')) return showFeedback('Pick an available word.', false);
  checkMatch(drag.letter, target);
}
function checkMatch(letter, target) {
  const word = target.dataset.word;
  if (target.dataset.letter === letter) {
    state.matched.set(word, letter); state.combo += 1; state.score += 100 + Math.max(0, state.combo - 1) * 25; target.classList.add('matched'); target.setAttribute('aria-label', `${word}, matched`); document.querySelector(`[data-letter="${letter}"]`).classList.add('has-matches'); playTone(true); showFeedback(`Great job! ${word} starts with ${letter}.`, true); drawMatches(); updateStats(); if (state.matched.size === state.words.length) completeLevel();
  } else {
    state.combo = 0; target.classList.add('shake'); playTone(false); showFeedback(`Almost! ${word} starts with ${target.dataset.letter}.`, false); setTimeout(() => target.classList.remove('shake'), 500); updateStats();
  }
}
function drawMatches() {
  elements.lineLayer.innerHTML = ''; state.matched.forEach((letter, word) => { const source = document.querySelector(`[data-letter="${letter}"]`); const target = document.querySelector(`[data-word="${CSS.escape(word)}"]`); if (!source || !target) return; const start = getCardPoint(source, 'right'); const end = getCardPoint(target, 'left'); const curve = Math.max(45, (end.x - start.x) * .45); const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('class', 'match-line'); path.setAttribute('d', `M ${start.x} ${start.y} C ${start.x + curve} ${start.y}, ${end.x - curve} ${end.y}, ${end.x} ${end.y}`); elements.lineLayer.appendChild(path); const check = document.createElementNS('http://www.w3.org/2000/svg', 'text'); check.setAttribute('class', 'match-check-text'); check.setAttribute('x', end.x - 19); check.setAttribute('y', end.y - 8); check.textContent = '✓'; elements.lineLayer.appendChild(check); }); }
function updateStats() { const count = state.words.length; elements.score.textContent = String(state.score).padStart(3, '0'); elements.progress.textContent = `${state.matched.size} / ${count} matched`; elements.progressBar.style.width = `${(state.matched.size / count) * 100}%`; elements.combo.textContent = `x${state.combo}`; elements.comboStat.style.opacity = state.combo ? '1' : '.62'; }
function updateTimer() { if (!state.completed && !elements.pauseOverlay.hidden) return; if (!state.completed) elements.timer.textContent = formatTime(currentSeconds()); }
function showFeedback(message, good) { elements.feedback.textContent = `${good ? '\u2713 ' : '\u2715 '}${message}`; elements.feedback.className = `feedback visible${good ? ' good' : ''}`; clearTimeout(showFeedback.timeout); showFeedback.timeout = setTimeout(() => elements.feedback.classList.remove('visible'), 2200); }
function useHint() { if (state.hints <= 0 || state.completed) return; const available = state.words.find(({ word }) => !state.matched.has(word)); if (!available) return; state.hints -= 1; elements.hintsLeft.textContent = state.hints; const target = document.querySelector(`[data-word="${CSS.escape(available.word)}"]`); target.classList.add('hint'); setTimeout(() => target.classList.remove('hint'), 1600); showFeedback(`${available.letter} is looking for ${available.word}!`, true); }
function completeLevel() { state.completed = true; clearInterval(state.timerId); const time = currentSeconds(); elements.finalScore.textContent = state.score; elements.finalMatches.textContent = `${state.matched.size} / ${state.words.length}`; elements.finalTime.textContent = formatTime(time); setTimeout(() => { elements.completionOverlay.hidden = false; }, 550); }
function togglePause() { if (state.completed) return; if (elements.pauseOverlay.hidden) { state.elapsedBeforePause = currentSeconds(); clearInterval(state.timerId); elements.pauseOverlay.hidden = false; } else { state.startedAt = Date.now(); elements.pauseOverlay.hidden = true; state.timerId = setInterval(updateTimer, 1000); } }

window.addEventListener('resize', drawMatches); document.querySelector('#hintButton').addEventListener('click', useHint); document.querySelector('#restartButton').addEventListener('click', () => { state.score = 0; setupLevel(); }); elements.pauseButton.addEventListener('click', togglePause); document.querySelector('#resumeButton').addEventListener('click', togglePause); document.querySelector('#playAgainButton').addEventListener('click', () => { state.score = 0; setupLevel(); }); document.querySelector('#nextLevelButton').addEventListener('click', () => { state.level = (state.level + 1) % levelConfig.length; state.score = 0; setupLevel(); });
setupLevel();
