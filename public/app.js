(() => {
  const $ = (s) => document.querySelector(s);

  const startView = $("#startView");
  const resultView = $("#resultView");
  const form = $("#articleForm");
  const input = $("#articleInput");
  const analyzeBtn = $("#analyzeBtn");
  const charCount = $("#charCount");
  const startStatus = $("#startStatus");
  const stats = $("#articleStats");
  const sentenceList = $("#sentenceList");
  const listenSentenceList = $("#listenSentenceList");
  const vocabBody = $("#vocabBody");

  const englishVoice = $("#englishVoice");
  const chineseVoice = $("#chineseVoice");
  const speechRate = $("#speechRate");
  const speechMode = $("#speechMode");
  const autoNext = $("#autoNext");
  const speechStatus = $("#speechStatus");

  const summaryPreview = $("#summaryPreview");
  const keywordPreview = $("#keywordPreview");
  const summaryInput = $("#summaryInput");
  const summaryCount = $("#summaryCount");
  const keywordInputs = [$("#keyword1"), $("#keyword2"), $("#keyword3")];
  const selectedCount = $("#selectedCount");
  const selectionHint = $("#selectionHint");
  const selectedWordsList = $("#selectedWordsList");
  const exportWordBtn = $("#exportWordBtn");
  const exportHint = $("#exportHint");
  const exportStatus = $("#exportStatus");

  let data = { summary_zh: "", keywords: [], sentences: [], vocabulary: [] };
  let index = 0;
  let voices = [];
  let paused = false;
  let playbackId = 0;
  const difficultWords = new Set();

  input.addEventListener("input", () => {
    charCount.textContent = `${input.value.length.toLocaleString()} / 24,000`;
  });

  function countChars(text) {
    return Array.from(String(text || "").replace(/\s/g, "")).length;
  }

  function setStartStatus(text, isError = false) {
    startStatus.textContent = text;
    startStatus.classList.toggle("error", isError);
  }

  function setExportStatus(text, isError = false) {
    exportStatus.textContent = text;
    exportStatus.classList.toggle("error", isError);
  }

  function showResults() {
    startView.classList.add("hidden");
    resultView.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showStart() {
    cancelSpeech();
    resultView.classList.add("hidden");
    startView.classList.remove("hidden");
    setStartStatus("");
    setTimeout(() => input.focus(), 50);
  }

  function activateTab(name) {
    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === name);
    });
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.add("hidden"));
    $(`#panel-${name}`).classList.remove("hidden");
  }

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  $("#newArticleBtn").addEventListener("click", showStart);
  $("#goVocabBtn").addEventListener("click", () => activateTab("vocab"));

  function renderInsights() {
    summaryPreview.textContent = data.summary_zh || "—";
    keywordPreview.innerHTML = "";
    (data.keywords || []).forEach((keyword) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = keyword;
      keywordPreview.appendChild(chip);
    });

    summaryInput.value = data.summary_zh || "";
    keywordInputs.forEach((field, i) => {
      field.value = data.keywords?.[i] || "";
    });
    updateSummaryCount();
  }

  function updateSummaryCount() {
    const length = countChars(summaryInput.value);
    summaryCount.textContent = `${length} / 30`;
    summaryCount.classList.toggle("over-limit", length > 30);
    updateExportState();
  }

  summaryInput.addEventListener("input", () => {
    summaryPreview.textContent = summaryInput.value.trim() || "—";
    updateSummaryCount();
  });

  keywordInputs.forEach((field) => {
    field.addEventListener("input", () => {
      const keywords = keywordInputs.map((x) => x.value.trim()).filter(Boolean);
      keywordPreview.innerHTML = "";
      keywords.forEach((keyword) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = keyword;
        keywordPreview.appendChild(chip);
      });
      updateExportState();
    });
  });

  function renderSentences() {
    sentenceList.innerHTML = "";
    listenSentenceList.innerHTML = "";

    data.sentences.forEach((item, i) => {
      const build = () => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sentence-card";
        if (i === index) button.classList.add("active");

        const number = document.createElement("span");
        number.className = "sentence-number";
        number.textContent = `第 ${i + 1} 句 · 點一下朗讀`;

        const en = document.createElement("span");
        en.className = "sentence-en";
        en.textContent = item.en;

        const zh = document.createElement("span");
        zh.className = "sentence-zh";
        zh.textContent = item.zh;

        button.append(number, en, zh);
        button.addEventListener("click", () => {
          index = i;
          renderCurrent();
          activateTab("listen");
          speakCurrent();
        });
        return button;
      };

      sentenceList.appendChild(build());
      listenSentenceList.appendChild(build());
    });
  }

  function renderCurrent() {
    const item = data.sentences[index];
    if (!item) return;

    $("#sentenceCounter").textContent = `第 ${index + 1} / ${data.sentences.length} 句`;
    $("#currentEnglish").textContent = item.en;
    $("#currentChinese").textContent = item.zh;

    const allCards = [...document.querySelectorAll(".sentence-card")];
    allCards.forEach((card, position) => {
      card.classList.remove("active");
      const cardIndex = position % data.sentences.length;
      if (cardIndex === index) card.classList.add("active");
    });
  }

  function toggleDifficultWord(i) {
    if (difficultWords.has(i)) {
      difficultWords.delete(i);
    } else if (difficultWords.size < 6) {
      difficultWords.add(i);
    }
    renderVocab();
    renderSelectedWords();
    updateExportState();
  }

  function renderVocab() {
    vocabBody.innerHTML = "";
    data.vocabulary.forEach((item, i) => {
      const tr = document.createElement("tr");
      if (difficultWords.has(i)) tr.classList.add("selected-row");

      const selectCell = document.createElement("td");
      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = difficultWords.has(i) ? "select-word selected" : "select-word";
      selectButton.textContent = difficultWords.has(i) ? "✓ 已選" : "選取";
      selectButton.setAttribute("aria-pressed", difficultWords.has(i) ? "true" : "false");
      selectButton.addEventListener("click", () => toggleDifficultWord(i));
      selectCell.appendChild(selectButton);

      const wordCell = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "word-button";
      button.textContent = `🔊 ${item.word}`;
      button.addEventListener("click", () => speakWord(item.word));
      wordCell.appendChild(button);

      const pos = document.createElement("td");
      pos.textContent = item.part_of_speech || "—";

      const meaning = document.createElement("td");
      meaning.textContent = item.meaning_zh || "—";

      tr.append(selectCell, wordCell, pos, meaning);
      vocabBody.appendChild(tr);
    });
    updateSelectionIndicator();
  }

  function updateSelectionIndicator() {
    const size = difficultWords.size;
    selectedCount.textContent = `${size} / 6`;
    if (size < 3) {
      selectionHint.textContent = `再選 ${3 - size} 個，完成你的 3 個重點難字`;
    } else if (size < 6) {
      selectionHint.textContent = `3 個重點已完成；再選 ${6 - size} 個即可輸出學習單`;
    } else {
      selectionHint.textContent = "已選滿 6 個，可輸出 Word";
    }
  }

  function getSelectedWords() {
    return [...difficultWords]
      .sort((a, b) => a - b)
      .map((i) => data.vocabulary[i])
      .filter(Boolean);
  }

  function renderSelectedWords() {
    selectedWordsList.innerHTML = "";
    const selected = getSelectedWords();
    if (!selected.length) {
      const empty = document.createElement("p");
      empty.className = "muted empty-selected";
      empty.textContent = "尚未選取單字。";
      selectedWordsList.appendChild(empty);
      return;
    }

    selected.forEach((item, position) => {
      const row = document.createElement("div");
      row.className = "selected-word-item";

      const n = document.createElement("span");
      n.className = "selected-word-number";
      n.textContent = String(position + 1);

      const body = document.createElement("div");
      const word = document.createElement("strong");
      word.textContent = item.word;
      const meaning = document.createElement("span");
      meaning.textContent = `${item.part_of_speech ? `${item.part_of_speech} · ` : ""}${item.meaning_zh}`;
      body.append(word, meaning);

      row.append(n, body);
      selectedWordsList.appendChild(row);
    });
  }

  function updateExportState() {
    const summaryOk = summaryInput.value.trim() && countChars(summaryInput.value) <= 30;
    const keywords = keywordInputs.map((x) => x.value.trim()).filter(Boolean);
    const wordsOk = difficultWords.size === 6;
    const ready = Boolean(summaryOk && keywords.length === 3 && wordsOk);

    exportWordBtn.disabled = !ready;
    if (!summaryOk) {
      exportHint.textContent = "請確認文章主旨不超過 30 個字。";
    } else if (keywords.length !== 3) {
      exportHint.textContent = "請保留 3 個關鍵字。";
    } else if (!wordsOk) {
      exportHint.textContent = `還差 ${6 - difficultWords.size} 個困難單字。`;
    } else {
      exportHint.textContent = "三題都完成，可以直接下載 Word。";
    }
  }

  function fillVoiceSelect(select, languagePrefix, preferredLocales = []) {
    const matching = voices.filter((v) => v.lang.toLowerCase().startsWith(languagePrefix));
    select.innerHTML = "";

    if (!matching.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "系統預設";
      select.appendChild(option);
      return;
    }

    matching.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.name;
      option.textContent = `${voice.name} — ${voice.lang}`;
      select.appendChild(option);
    });

    const preferred =
      matching.find((v) => preferredLocales.includes(v.lang.toLowerCase())) || matching[0];
    if (preferred) select.value = preferred.name;
  }

  function loadVoices() {
    if (!("speechSynthesis" in window)) return;
    voices = window.speechSynthesis.getVoices();
    fillVoiceSelect(englishVoice, "en", ["en-us", "en-gb"]);
    fillVoiceSelect(chineseVoice, "zh", ["zh-tw", "zh-hant-tw", "zh-hk"]);
  }

  loadVoices();
  if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = loadVoices;

  function getVoice(name) {
    return voices.find((v) => v.name === name) || null;
  }

  function cancelSpeech() {
    playbackId += 1;
    paused = false;
    $("#pauseBtn").textContent = "⏸ 暫停";
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function utter(text, lang, voiceName, token) {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window) || token !== playbackId) {
        resolve();
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = Number(speechRate.value) || 1;
      const voice = getVoice(voiceName);
      if (voice) u.voice = voice;
      u.onend = resolve;
      u.onerror = resolve;
      window.speechSynthesis.speak(u);
    });
  }

  async function speakCurrent() {
    const item = data.sentences[index];
    if (!item || !("speechSynthesis" in window)) {
      speechStatus.textContent = "此瀏覽器目前不支援語音朗讀。";
      return;
    }

    cancelSpeech();
    const token = playbackId;
    const current = index;
    const mode = speechMode.value;
    speechStatus.textContent = `正在播放第 ${current + 1} 句`;

    if (mode === "both" || mode === "en") await utter(item.en, "en-US", englishVoice.value, token);
    if (token !== playbackId || current !== index) return;

    if (mode === "both") await new Promise((r) => setTimeout(r, 380));
    if (mode === "both" || mode === "zh") await utter(item.zh, "zh-TW", chineseVoice.value, token);
    if (token !== playbackId || current !== index) return;

    speechStatus.textContent = "播放完成";
    if (autoNext.checked && index < data.sentences.length - 1) {
      index += 1;
      renderCurrent();
      setTimeout(() => {
        if (token === playbackId) speakCurrent();
      }, 450);
    }
  }

  function speakWord(word) {
    if (!("speechSynthesis" in window)) return;
    cancelSpeech();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US";
    u.rate = Number(speechRate.value) || 0.85;
    const voice = getVoice(englishVoice.value);
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  }

  $("#playBtn").addEventListener("click", () => {
    if (paused && "speechSynthesis" in window) {
      window.speechSynthesis.resume();
      paused = false;
      $("#pauseBtn").textContent = "⏸ 暫停";
      speechStatus.textContent = "繼續播放";
    } else {
      speakCurrent();
    }
  });

  $("#pauseBtn").addEventListener("click", () => {
    if (!("speechSynthesis" in window)) return;
    if (paused) {
      window.speechSynthesis.resume();
      paused = false;
      $("#pauseBtn").textContent = "⏸ 暫停";
      speechStatus.textContent = "繼續播放";
    } else if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      paused = true;
      $("#pauseBtn").textContent = "▶ 繼續";
      speechStatus.textContent = "已暫停";
    }
  });

  $("#repeatBtn").addEventListener("click", speakCurrent);
  $("#prevBtn").addEventListener("click", () => {
    index = Math.max(0, index - 1);
    renderCurrent();
    speakCurrent();
  });
  $("#nextBtn").addEventListener("click", () => {
    index = Math.min(data.sentences.length - 1, index + 1);
    renderCurrent();
    speakCurrent();
  });

  exportWordBtn.addEventListener("click", async () => {
    updateExportState();
    if (exportWordBtn.disabled) return;

    setExportStatus("正在產生 Word…");
    exportWordBtn.disabled = true;
    const originalText = exportWordBtn.textContent;
    exportWordBtn.textContent = "產生中…";

    try {
      const response = await fetch("/api/export-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: summaryInput.value.trim(),
          keywords: keywordInputs.map((x) => x.value.trim()),
          selectedWords: getSelectedWords()
        })
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Word 產生失敗。" );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "PRHW2_學習單_完成版.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportStatus("Word 已下載。" );
    } catch (error) {
      setExportStatus(error.message || "Word 產生失敗，請稍後再試。", true);
    } finally {
      exportWordBtn.textContent = originalText;
      updateExportState();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const article = input.value.trim();

    if (!article) {
      setStartStatus("請先貼上英文文章。", true);
      return;
    }

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "分析中…";
    setStartStatus("正在翻譯、整理主旨、關鍵字與單字…");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article })
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "目前無法分析文章。" );

      data = body;
      index = 0;
      difficultWords.clear();
      stats.textContent = `${data.sentences.length} 句 · ${data.vocabulary.length} 個重點單字 · 已整理學習單`;

      renderInsights();
      renderSentences();
      renderCurrent();
      renderVocab();
      renderSelectedWords();
      updateExportState();
      activateTab("bilingual");
      showResults();
      setStartStatus("");
      setExportStatus("");
    } catch (error) {
      setStartStatus(error.message || "目前無法分析文章，請稍後再試。", true);
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "開始拆解";
    }
  });
})();
