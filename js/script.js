// For Vercel, use '/api/generate-rubric'
// For Netlify, use '/.netlify/functions/generate-rubric'
const AI_FUNCTION_URL = '/api/generate-rubric';

const REPERTORY_PATHS = ['./data/repertory_master.json'];

// DOM elements
const statusText = document.getElementById('status-text');
const resultContainer = document.getElementById('result-container');
const resultHeader = document.getElementById('result-header');
const resultOutput = document.getElementById('result-output');
const resultContext = document.getElementById('result-context');
const mainInput = document.getElementById('main-input');
const findMatchBtn = document.getElementById('find-match-btn');
const askAiBtn = document.getElementById('ask-ai-btn');
const directSearchBtn = document.getElementById('direct-search-btn');
const analyzeTotalityBtn = document.getElementById('analyze-totality-btn');
const clearSymptomsBtn = document.getElementById('clear-symptoms-btn');
const singleMode = document.getElementById('single-mode');
const totalityMode = document.getElementById('totality-mode');
const remedyMode = document.getElementById('remedy-mode');
const remedyInput = document.getElementById('remedy-input');
const remedySuggestions = document.getElementById('remedy-suggestions');
const searchRemedyBtn = document.getElementById('search-remedy-btn');
const popularRemediesBtn = document.getElementById('popular-remedies-btn');

let repertoryDB = [];
let allRemedies = [];
let remedyIndex = {};

async function loadRepertory() {
  statusText.textContent = 'Loading repertory data...';
  for (let path of REPERTORY_PATHS) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      repertoryDB = await res.json();
      buildRemedyIndex();
      let count = repertoryDB.length;
      let rounded = Math.round(count / 1000) * 1000;
      statusText.textContent = `Ready! Searching ${rounded.toLocaleString()}+ rubrics.`;
      console.log(`Loaded repertory from ${path} (${count} actual rubrics)`);
      return;
    } catch (err) {
      console.warn(`Failed to load from ${path}:`, err);
    }
  }
  statusText.textContent = 'Failed to load repertory data.';
}

function buildRemedyIndex() {
  console.log("Building remedy index...");
  const tempIndex = {};
  const remedySet = new Set();
  repertoryDB.forEach((rubric, index) => {
    if (rubric.m && rubric.m.length) {
      rubric.m.forEach(remedy => {
        const cleanRemedy = remedy.trim();
        remedySet.add(cleanRemedy);
        const key = cleanRemedy.toLowerCase();
        if (!tempIndex[key]) {
          tempIndex[key] = [];
        }
        tempIndex[key].push(index);
      });
    }
  });
  remedyIndex = tempIndex;
  allRemedies = Array.from(remedySet).sort();
  console.log(`Remedy index built. Found ${allRemedies.length} unique remedies.`);
}

document.addEventListener('DOMContentLoaded', function() {
  const modeRadios = document.querySelectorAll('input[name="mode"]');
  modeRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      singleMode.classList.add('hidden');
      totalityMode.classList.add('hidden');
      remedyMode.classList.add('hidden');
      if (this.value === 'single') singleMode.classList.remove('hidden');
      else if (this.value === 'totality') totalityMode.classList.remove('hidden');
      else if (this.value === 'remedy') remedyMode.classList.remove('hidden');
      resultContainer.style.display = 'none';
    });
  });
  loadRepertory();
});

function addSymptom() {
  const symptomsList = document.getElementById('symptoms-list');
  const newEntry = document.createElement('div');
  newEntry.className = 'symptom-entry';
  newEntry.innerHTML = `<input type="text" placeholder="Enter symptom or rubric..." class="symptom-input-field"><button class="remove-symptom" onclick="removeSymptom(this)">Remove</button>`;
  symptomsList.appendChild(newEntry);
}

function removeSymptom(button) {
  const symptomsList = document.getElementById('symptoms-list');
  if (symptomsList.children.length > 1) {
    button.parentElement.remove();
  }
}

function clearAllSymptoms() {
  const symptomsList = document.getElementById('symptoms-list');
  symptomsList.innerHTML = `<div class="symptom-entry"><input type="text" placeholder="Enter symptom or rubric..." class="symptom-input-field"><button class="remove-symptom" onclick="removeSymptom(this)">Remove</button></div>`;
}

function getSymptomsList() {
  return Array.from(document.querySelectorAll('.symptom-input-field')).map(input => input.value.trim()).filter(Boolean);
}

function addRubricToTotality(rubric) {
  document.querySelector('input[name="mode"][value="totality"]').click();
  const inputs = document.querySelectorAll('.symptom-input-field');
  let added = false;
  for (let input of inputs) {
    if (!input.value.trim()) {
      input.value = rubric;
      added = true;
      break;
    }
  }
  if (!added) {
    addSymptom();
    const newInputs = document.querySelectorAll('.symptom-input-field');
    newInputs[newInputs.length - 1].value = rubric;
  }
  showNotification(`Added "${rubric}" to totality analysis`, 'success');
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showNotification(`Copied to clipboard`, 'success');
  } catch (err) {
    showNotification('Failed to copy', 'error');
  }
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.classList.add('show'), 100);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => document.body.removeChild(notification), 300);
  }, 3000);
}

async function handleAskAI(query) {
  if (!query) return showNotification('Please enter a symptom description.', 'error');
  askAiBtn.disabled = true;
  askAiBtn.textContent = 'Generating...';
  try {
    const selectedRepertory = document.querySelector('input[name="repertory"]:checked').value;
    const response = await fetch(AI_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symptom: query, repertory: selectedRepertory })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const generatedRubric = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (generatedRubric) {
      displayMatches(generatedRubric, findClosestRubrics(generatedRubric));
      showNotification('AI rubric generated successfully!', 'success');
    } else {
      console.error("Could not find 'generatedRubric' in the AI response.", result);
      displayMatches(query, []);
    }
  } catch (err) {
    console.error("AI error:", err);
    showNotification('AI generation failed. Please try again.', 'error');
    handleDirectSearch(query);
  } finally {
    askAiBtn.disabled = false;
    askAiBtn.textContent = 'Ask AI to Generate';
  }
}

function handleDirectSearch(query) {
  if (!query) return showNotification('Please enter a rubric or symptom.', 'error');
  displayMatches(query, findClosestRubrics(query));
}

function findClosestRubrics(query) {
  const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const queryWords = normalizedQuery.split(/\s+/);
  let exact = repertoryDB.filter(r => r.r.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim() === normalizedQuery && r.m);
  if (exact.length) return exact;
  let keywordMatches = repertoryDB.filter(r => {
    const normRubric = r.r.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    return queryWords.every(w => normRubric.includes(w)) && r.m;
  });
  if (keywordMatches.length) return keywordMatches;
  return repertoryDB.filter(r => r.r.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().includes(normalizedQuery));
}

function displayMatches(query, matches) {
  resultContainer.style.display = 'block';
  if (!matches.length) {
    resultHeader.textContent = `No match found for "${query}"`;
    resultOutput.innerHTML = `<p><em>No matching rubrics found. Please try different keywords.</em></p>`;
    return;
  }
  resultHeader.textContent = `Results for "${query}"`;
  let html = '';
  matches.forEach(m => {
    const rubricForJs = m.r.replace(/'/g, "\\'").replace(/"/g, '\\"');
    html += `<div class="rubric-block"><div class="rubric-actions"><button class="action-btn add-totality-btn" onclick="addRubricToTotality('${rubricForJs}')">Add to Totality</button><button class="action-btn copy-btn" onclick="copyToClipboard('${rubricForJs}')">Copy</button></div><p><strong>Rubric:</strong> ${m.r}</p>`;
    if (m.m && m.m.length) {
      html += `<div><strong>Remedies (${m.m.length}):</strong><br>${m.m.map(rem => `<span class="remedy-tag">${rem}</span>`).join(" ")}</div>`;
    }
    html += `<p class="src">Source: ${m.src}</p></div>`;
  });
  resultOutput.innerHTML = html;
  resultContext.textContent = `Found ${matches.length} matching rubric(s).`;
}

// Event Listeners for buttons
if (findMatchBtn) findMatchBtn.addEventListener("click", () => handleDirectSearch(mainInput.value.trim()));
if (askAiBtn) askAiBtn.addEventListener("click", () => handleAskAI(mainInput.value.trim()));
if (directSearchBtn) directSearchBtn.addEventListener("click", () => handleDirectSearch(mainInput.value.trim()));
