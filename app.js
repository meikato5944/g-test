// 問題データを読み込む
let allQuestions = [];
let questionById = new Map();
let questions = [];
let currentQuestionIndex = 0;
let userAnswers = {}; // { questionId: selectedOptionIndex }
let shuffledOptions = {}; // { questionId: { shuffledOptions: [...], correctAnswerIndex: number, originalToShuffled: Map } }
let skippedQuestions = new Set(); // スキップした問題IDのセット
let orderPreference = null; // 'random' | 'sequential'（初回モーダルで選択）
let mode = 'normal'; // 'normal' | 'review'
let eventListenersInitialized = false;
let orderChoiceHiddenByImport = false;

const STORAGE_KEYS = {
    activeMode: 'gtest_quiz_active_mode_v1',
    normal: 'gtest_quiz_normal_state_v1',
    review: 'gtest_quiz_review_state_v1'
};

// 問題データを読み込む
function loadQuestions() {
    try {
        // questions.jsから直接読み込む
        const loadedQuestions = questionsData || [];
        
        // 問題IDでマップを作成
        const questionMap = new Map();
        loadedQuestions.forEach(q => {
            questionMap.set(q.id, q);
        });
        
        // 1から191までのすべての問題を生成（不足分はプレースホルダー）
        allQuestions = [];
        for (let i = 1; i <= 191; i++) {
            if (questionMap.has(i)) {
                allQuestions.push(questionMap.get(i));
            } else {
                allQuestions.push({
                    id: i,
                    question: `問題 ${i} の内容（後ほど追加予定）`,
                    options: [
                        "選択肢1",
                        "選択肢2",
                        "選択肢3",
                        "選択肢4"
                    ],
                    correctAnswer: null
                });
            }
        }
        questionById = new Map(allQuestions.map(q => [q.id, q]));

        // localStorageに保存された状態があれば復元し、なければ通常試験を開始
        if (!restoreActiveStateFromStorage()) {
            startNewNormalExamWithOrderChoice();
        }
    } catch (error) {
        console.error('問題データの読み込みに失敗しました:', error);
        alert('問題データの読み込みに失敗しました。\nエラー: ' + error.message);
    }
}

function getStorageKeyForMode(targetMode) {
    return targetMode === 'review' ? STORAGE_KEYS.review : STORAGE_KEYS.normal;
}

function serializeShuffledOptions() {
    const serialized = {};
    Object.keys(shuffledOptions).forEach((id) => {
        const entry = shuffledOptions[id];
        if (!entry) return;

        const optionCount = Array.isArray(entry.shuffledOptions) ? entry.shuffledOptions.length : 4;
        const originalToShuffledArr = new Array(optionCount).fill(null);
        const shuffledToOriginalArr = new Array(optionCount).fill(null);

        if (entry.originalToShuffled && typeof entry.originalToShuffled.get === 'function') {
            for (let i = 0; i < optionCount; i++) originalToShuffledArr[i] = entry.originalToShuffled.get(i);
        }
        if (entry.shuffledToOriginal && typeof entry.shuffledToOriginal.get === 'function') {
            for (let i = 0; i < optionCount; i++) shuffledToOriginalArr[i] = entry.shuffledToOriginal.get(i);
        }

        serialized[id] = {
            shuffledOptions: entry.shuffledOptions,
            correctAnswerIndex: entry.correctAnswerIndex,
            originalToShuffled: originalToShuffledArr,
            shuffledToOriginal: shuffledToOriginalArr
        };
    });
    return serialized;
}

function deserializeShuffledOptions(serialized) {
    const restored = {};
    if (!serialized || typeof serialized !== 'object') return restored;

    Object.keys(serialized).forEach((id) => {
        const entry = serialized[id];
        if (!entry) return;

        const originalToShuffled = new Map();
        const shuffledToOriginal = new Map();
        if (Array.isArray(entry.originalToShuffled)) {
            entry.originalToShuffled.forEach((v, i) => originalToShuffled.set(i, v));
        }
        if (Array.isArray(entry.shuffledToOriginal)) {
            entry.shuffledToOriginal.forEach((v, i) => shuffledToOriginal.set(i, v));
        }

        restored[id] = {
            shuffledOptions: entry.shuffledOptions || [],
            correctAnswerIndex: entry.correctAnswerIndex ?? null,
            originalToShuffled,
            shuffledToOriginal
        };
    });

    return restored;
}

function saveStateToStorage() {
    try {
        const key = getStorageKeyForMode(mode);
        const state = {
            version: 1,
            mode,
            activeQuestionIds: questions.map(q => q.id),
            currentQuestionIndex,
            userAnswers,
            skippedQuestionIds: Array.from(skippedQuestions),
            orderPreference,
            shuffledOptionsById: serializeShuffledOptions()
        };
        localStorage.setItem(STORAGE_KEYS.activeMode, mode);
        localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
        // localStorageが使えない環境でも動作は継続
        console.warn('状態の保存に失敗しました:', e);
    }
}

function restoreStateFromStorage(targetMode) {
    try {
        const raw = localStorage.getItem(getStorageKeyForMode(targetMode));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.activeQuestionIds)) return null;
        return parsed;
    } catch (e) {
        console.warn('状態の復元に失敗しました:', e);
        return null;
    }
}

function applyRestoredState(restored) {
    mode = restored.mode === 'review' ? 'review' : 'normal';
    orderPreference = restored.orderPreference ?? null;
    userAnswers = restored.userAnswers && typeof restored.userAnswers === 'object' ? restored.userAnswers : {};
    skippedQuestions = new Set(Array.isArray(restored.skippedQuestionIds) ? restored.skippedQuestionIds : []);
    shuffledOptions = deserializeShuffledOptions(restored.shuffledOptionsById);

    const ids = restored.activeQuestionIds;
    questions = ids.map(id => questionById.get(id)).filter(Boolean);
    currentQuestionIndex = Math.min(Math.max(restored.currentQuestionIndex ?? 0, 0), Math.max(questions.length - 1, 0));

    updateModeUI();
    initializeApp();
    saveStateToStorage();
}

function restoreActiveStateFromStorage() {
    const active = (() => {
        try {
            const storedMode = localStorage.getItem(STORAGE_KEYS.activeMode);
            return storedMode === 'review' ? 'review' : 'normal';
        } catch {
            return 'normal';
        }
    })();

    const restored = restoreStateFromStorage(active) || restoreStateFromStorage('normal') || restoreStateFromStorage('review');
    if (!restored) return false;

    applyRestoredState(restored);
    return true;
}

function startNewNormalExamWithOrderChoice() {
    mode = 'normal';
    questions = [...allQuestions];
    userAnswers = {};
    skippedQuestions = new Set();
    shuffledOptions = {};
    currentQuestionIndex = 0;
    updateModeUI();

    showOrderChoiceModal({
        title: '問題の表示順を選んでください',
        description: '試験開始時に、問題をどの順番で表示するか選択します。',
        onChoose: (shuffle) => {
            orderPreference = shuffle ? 'random' : 'sequential';
            questions = shuffle ? shuffleArray(questions) : [...questions].sort((a, b) => a.id - b.id);
            initializeApp();
            saveStateToStorage();
        }
    });
}

function startReviewExamWithOrderChoice(mistakeQuestionIds) {
    if (!Array.isArray(mistakeQuestionIds) || mistakeQuestionIds.length === 0) return;

    // 結果モーダルが開いている場合は閉じる（モーダルの重なり防止）
    closeResultModal();

    // 現在のモードの状態を保存し、復習モードへ切り替え
    saveStateToStorage();

    mode = 'review';
    const uniqueIds = Array.from(new Set(mistakeQuestionIds)).filter(id => questionById.has(id));
    questions = uniqueIds.map(id => questionById.get(id)).filter(Boolean);
    currentQuestionIndex = 0;

    // 復習は毎回新規試験として開始（回答/スキップはリセット）
    userAnswers = {};
    skippedQuestions = new Set();
    updateModeUI();

    showOrderChoiceModal({
        title: '復習の表示順を選んでください',
        description: `間違い（未回答/スキップ/不正解） ${questions.length}問 をもう一度解きます。`,
        onChoose: (shuffle) => {
            orderPreference = shuffle ? 'random' : 'sequential';
            questions = shuffle ? shuffleArray(questions) : [...questions].sort((a, b) => a.id - b.id);
            initializeApp();
            saveStateToStorage();
        }
    });
}

function switchToNormalMode() {
    saveStateToStorage();
    const restored = restoreStateFromStorage('normal');
    if (restored) {
        applyRestoredState(restored);
        return;
    }
    startNewNormalExamWithOrderChoice();
}

function updateModeUI() {
    const backBtn = document.getElementById('backToNormalButton');
    const badge = document.getElementById('modeBadge');
    if (badge) badge.textContent = mode === 'review' ? '復習モード' : '通常モード';

    if (backBtn) {
        backBtn.style.display = mode === 'review' ? 'inline-flex' : 'none';
    }
}

function openImportReviewModal() {
    const modal = document.getElementById('importReviewModal');
    if (!modal) return;
    const orderChoiceModal = document.getElementById('orderChoiceModal');
    if (orderChoiceModal && orderChoiceModal.style.display !== 'none') {
        orderChoiceHiddenByImport = true;
        orderChoiceModal.style.display = 'none';
    } else {
        orderChoiceHiddenByImport = false;
    }
    modal.style.display = 'flex';
}

function closeImportReviewModal() {
    const modal = document.getElementById('importReviewModal');
    if (!modal) return;
    modal.style.display = 'none';
    if (orderChoiceHiddenByImport) {
        const orderChoiceModal = document.getElementById('orderChoiceModal');
        if (orderChoiceModal) orderChoiceModal.style.display = 'flex';
        orderChoiceHiddenByImport = false;
    }
}

function parseQuestionIdsFromText(text) {
    if (!text) return [];
    const ids = [];

    // ダウンロードテキストの形式（例: 【問題 12】）を優先して抽出
    const pattern = /【\s*問題\s*(\d+)\s*】/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        ids.push(Number(match[1]));
    }

    // 何も取れない場合に備え、弱いパターンも許容（例: 問題 12）
    if (ids.length === 0) {
        const fallback = /(?:^|\s)問題\s*(\d+)(?:\s|$)/g;
        while ((match = fallback.exec(text)) !== null) {
            ids.push(Number(match[1]));
        }
    }

    const normalized = ids
        .filter((n) => Number.isFinite(n))
        .map((n) => Math.trunc(n))
        .filter((n) => n >= 1 && n <= 191);

    return Array.from(new Set(normalized));
}

// 表示順選択モーダルを表示し、選択に応じて試験を開始
function showOrderChoiceModal({ title, description, onChoose }) {
    const modal = document.getElementById('orderChoiceModal');
    modal.style.display = 'flex';

    const titleEl = document.getElementById('orderChoiceTitle');
    const descEl = document.getElementById('orderChoiceDescription');
    if (titleEl && typeof title === 'string') titleEl.textContent = title;
    if (descEl && typeof description === 'string') descEl.textContent = description;

    const randomBtn = document.getElementById('orderRandomButton');
    const sequentialBtn = document.getElementById('orderSequentialButton');
    if (sequentialBtn) {
        sequentialBtn.textContent = `順番（1〜${questions.length}）`;
    }

    const startWithOrder = (shuffle) => {
        modal.style.display = 'none';
        if (typeof onChoose === 'function') onChoose(shuffle);
    };

    randomBtn.onclick = () => startWithOrder(true);
    sequentialBtn.onclick = () => startWithOrder(false);
}

function backToStartOrderChoice() {
    closeResultModal();
    closeImportReviewModal();

    // 試験状態を初期化（復習モードの場合は「現在の復習対象」を維持したままやり直し）
    if (mode === 'normal') {
        questions = [...allQuestions];
    } else {
        const currentIds = questions.map(q => q.id);
        questions = currentIds.map(id => questionById.get(id)).filter(Boolean);
    }

    userAnswers = {};
    skippedQuestions = new Set();
    shuffledOptions = {};
    currentQuestionIndex = 0;
    updateModeUI();

    const title = mode === 'review' ? '復習の表示順を選んでください' : '問題の表示順を選んでください';
    const description =
        mode === 'review'
            ? `復習対象 ${questions.length}問 をもう一度解きます。`
            : '試験開始時に、問題をどの順番で表示するか選択します。';

    showOrderChoiceModal({
        title,
        description,
        onChoose: (shuffle) => {
            orderPreference = shuffle ? 'random' : 'sequential';
            questions = shuffle ? shuffleArray(questions) : [...questions].sort((a, b) => a.id - b.id);
            initializeApp();
            saveStateToStorage();
        }
    });
}

// アプリを初期化
function initializeApp() {
    updateTotalQuestions();
    displayQuestion(currentQuestionIndex);
    updateProgress();
    generateQuestionGrid();
    setupEventListeners();
}

// 総問題数を更新
function updateTotalQuestions() {
    document.getElementById('totalQuestions').textContent = questions.length;
}

// 選択肢をシャッフル（Fisher-Yatesアルゴリズム）
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// 問題の選択肢をシャッフルして保存
function getShuffledOptions(question) {
    if (!shuffledOptions[question.id]) {
        // 選択肢をシャッフル
        const shuffled = shuffleArray(question.options);
        
        // 元のインデックスからシャッフル後のインデックスへのマッピング
        const originalToShuffled = new Map();
        const shuffledToOriginal = new Map();
        
        shuffled.forEach((option, newIndex) => {
            const originalIndex = question.options.indexOf(option);
            originalToShuffled.set(originalIndex, newIndex);
            shuffledToOriginal.set(newIndex, originalIndex);
        });
        
        // 正解のインデックスを更新
        // correctAnswerは1ベース（1, 2, 3, 4）で記録されているため、0ベース（0, 1, 2, 3）に変換
        let newCorrectAnswer = null;
        if (question.correctAnswer !== null) {
            const correctAnswerIndex = question.correctAnswer - 1; // 1ベースから0ベースに変換
            newCorrectAnswer = originalToShuffled.get(correctAnswerIndex);
        }
        
        shuffledOptions[question.id] = {
            shuffledOptions: shuffled,
            correctAnswerIndex: newCorrectAnswer,
            originalToShuffled: originalToShuffled,
            shuffledToOriginal: shuffledToOriginal
        };
    }
    
    return shuffledOptions[question.id];
}

// 問題を表示
function displayQuestion(index) {
    if (index < 0 || index >= questions.length) return;
    
    currentQuestionIndex = index;
    const question = questions[index];
    
    // まず正解セクションを確実に非表示にして内容をクリア
    const answerSection = document.getElementById('answerSection');
    answerSection.style.display = 'none';
    document.getElementById('correctAnswer').textContent = '';
    document.getElementById('explanationText').textContent = '';
    
    // 結果表示ボタンの表示/非表示を更新
    const showResultButton = document.getElementById('showResultButton');
    // 最後の問題に到達したら常に表示（スキップ/未回答も「間違い」として結果に含めるため）
    showResultButton.style.display = index === questions.length - 1 ? 'block' : 'none';
    
    // 問題番号と問題文を更新
    const questionNumberEl = document.getElementById('questionNumber');
    if (questionNumberEl) {
        // 表示上の問題番号は常に元の問題IDを表示する
        questionNumberEl.textContent = String(question.id);
        questionNumberEl.title = '';
    }
    document.getElementById('currentQuestion').textContent = index + 1;
    document.getElementById('questionText').textContent = question.question;
    
    // 選択肢をシャッフルして取得
    const shuffled = getShuffledOptions(question);
    
    // 選択肢を生成（既存の選択肢を完全に削除してから再生成）
    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = '';
    
    shuffled.shuffledOptions.forEach((option, optionIndex) => {
        const optionElement = document.createElement('div');
        optionElement.className = 'option';
        
        // 回答済みの場合のみ選択状態を表示（正解/不正解は表示しない）
        if (userAnswers[question.id] === optionIndex) {
            optionElement.classList.add('selected');
        }
        
        optionElement.innerHTML = `
            <span class="option-number">${optionIndex + 1}</span>
            <span class="option-text">${option}</span>
        `;
        
        optionElement.addEventListener('click', () => selectOption(question.id, optionIndex));
        optionsContainer.appendChild(optionElement);
    });
    
    // ナビゲーションボタンの状態を更新
    document.getElementById('prevButton').disabled = index === 0;
    document.getElementById('nextButton').disabled = index === questions.length - 1;
    
    // 問題一覧の現在の問題をハイライト
    updateQuestionGrid();
    updateProgress();
    saveStateToStorage();
}

// 選択肢を選択
function selectOption(questionId, optionIndex) {
    userAnswers[questionId] = optionIndex;
    // 回答したらスキップ扱いは解除
    skippedQuestions.delete(questionId);
    
    // 選択状態を更新
    const options = document.querySelectorAll('.option');
    const question = questions.find(q => q.id === questionId);
    const shuffled = shuffledOptions[questionId];
    
    options.forEach((opt, idx) => {
        opt.classList.remove('selected', 'correct', 'incorrect');
        if (idx === optionIndex) {
            opt.classList.add('selected');
            // 回答後、正解/不正解を表示
            if (shuffled && shuffled.correctAnswerIndex !== null) {
                if (idx === shuffled.correctAnswerIndex) {
                    opt.classList.add('correct');
                } else {
                    opt.classList.add('incorrect');
                }
            }
        }
    });
    
    // 正解をハイライト（回答後は常に表示）
    highlightCorrectAnswer();
    
    // 正解表示セクションを表示
    updateAnswerDisplay();
    
    // 問題一覧を更新
    updateQuestionGrid();
    
    // 最後の問題を回答した場合、結果表示ボタンを表示
    if (currentQuestionIndex === questions.length - 1) {
        const showResultButton = document.getElementById('showResultButton');
        showResultButton.style.display = 'block';
    }

    saveStateToStorage();
}

// 前の問題へ
function goToPreviousQuestion() {
    if (currentQuestionIndex > 0) {
        displayQuestion(currentQuestionIndex - 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// 次の問題へ
function goToNextQuestion() {
    if (currentQuestionIndex < questions.length - 1) {
        displayQuestion(currentQuestionIndex + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// 現在の問題をスキップ
function skipCurrentQuestion() {
    const question = questions[currentQuestionIndex];
    skippedQuestions.add(question.id);
    
    // スキップした問題の回答を削除（スキップした問題は未回答として扱う）
    if (userAnswers[question.id] !== undefined) {
        delete userAnswers[question.id];
    }
    
    // 次の問題へ移動
    if (currentQuestionIndex < questions.length - 1) {
        goToNextQuestion();
    } else {
        // 最後の問題の場合、最初の未回答の問題へ移動
        const nextUnansweredIndex = questions.findIndex((q, idx) => 
            idx > currentQuestionIndex && 
            userAnswers[q.id] === undefined && 
            !skippedQuestions.has(q.id)
        );
        
        if (nextUnansweredIndex !== -1) {
            displayQuestion(nextUnansweredIndex);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            // 未回答の問題がない場合、最初のスキップした問題へ
            const firstSkippedIndex = questions.findIndex(q => skippedQuestions.has(q.id));
            if (firstSkippedIndex !== -1) {
                displayQuestion(firstSkippedIndex);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    }
    
    // 問題一覧を更新
    updateQuestionGrid();
    saveStateToStorage();
}

// 特定の問題へジャンプ
function jumpToQuestion(questionId) {
    const questionIndex = questions.findIndex(q => q.id === questionId);
    if (questionIndex !== -1) {
        displayQuestion(questionIndex);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// 進捗バーを更新
function updateProgress() {
    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
    document.getElementById('progressFill').style.width = `${progress}%`;
}

// 問題一覧グリッドを生成
function generateQuestionGrid() {
    const grid = document.getElementById('questionGrid');
    grid.innerHTML = '';
    
    questions.forEach((question, index) => {
        const item = document.createElement('div');
        item.className = 'question-item';
        item.dataset.questionId = String(question.id);
        // 一覧の番号は「画面上部の問題番号」と一致させる（= 元の問題ID）
        item.textContent = String(question.id);
        // 復習モードのときだけ、復習内での並び順をツールチップに出す
        if (mode === 'review') item.title = `復習内の順番: ${index + 1} / ${questions.length}`;
        item.addEventListener('click', () => jumpToQuestion(question.id));
        grid.appendChild(item);
    });
    
    updateQuestionGrid();
}

// 問題一覧グリッドを更新
function updateQuestionGrid() {
    const grid = document.getElementById('questionGrid');
    if (!grid) return;

    const items = grid.querySelectorAll('.question-item');
    // モード切替/復元などで一覧DOMが古いまま残ると「出題対象以外」も表示されてしまうため、
    // 現在の出題リスト（questions）と件数がズレていたら一覧を作り直す。
    if (items.length !== questions.length) {
        generateQuestionGrid();
        return;
    }

    items.forEach((item, index) => {
        item.classList.remove('current', 'answered', 'correct-answered', 'incorrect-answered', 'skipped');
        
        if (index === currentQuestionIndex) {
            item.classList.add('current');
        }
        
        const questionId = questions[index].id;
        const question = questions[index];
        // 一覧の表示番号は常に「元の問題ID」に揃える（復習モードでもズレないよう更新時にも補正）
        item.textContent = String(questionId);
        item.dataset.questionId = String(questionId);
        if (mode === 'review') {
            item.title = `復習内の順番: ${index + 1} / ${questions.length}`;
        } else {
            item.title = '';
        }
        const userAnswer = userAnswers[questionId];
        const isSkipped = skippedQuestions.has(questionId);
        
        if (isSkipped) {
            item.classList.add('skipped');
        }
        
        if (userAnswer !== undefined) {
            item.classList.add('answered');
            
            // 回答済みの問題は正解/不正解を表示
            const shuffled = shuffledOptions[questionId];
            if (shuffled && shuffled.correctAnswerIndex !== null) {
                if (userAnswer === shuffled.correctAnswerIndex) {
                    item.classList.add('correct-answered');
                } else {
                    item.classList.add('incorrect-answered');
                }
            }
        }
    });
}

// 解説文内の選択肢番号をシャッフル後の番号に置き換える
function replaceOptionNumbersInExplanation(explanation, shuffled) {
    if (!explanation || !shuffled) return explanation;
    
    // 元の選択肢番号（1ベース）からシャッフル後の選択肢番号（1ベース）へのマッピングを作成
    const optionNumberMap = new Map();
    for (let originalIndex = 0; originalIndex < 4; originalIndex++) {
        const shuffledIndex = shuffled.originalToShuffled.get(originalIndex);
        if (shuffledIndex !== undefined) {
            // 1ベースの番号でマッピング（元の選択肢番号 → シャッフル後の選択肢番号）
            optionNumberMap.set(originalIndex + 1, shuffledIndex + 1);
        }
    }
    
    // 「選択肢1」「選択肢2」などのパターンを置き換え
    let replacedExplanation = explanation;
    optionNumberMap.forEach((newNumber, originalNumber) => {
        // 「選択肢1」「選択肢2」などのパターンを検出して置き換え
        const pattern = new RegExp(`選択肢${originalNumber}`, 'g');
        replacedExplanation = replacedExplanation.replace(pattern, `選択肢${newNumber}`);
    });
    
    return replacedExplanation;
}

// 正解表示を更新（回答済みの問題のみ表示）
function updateAnswerDisplay() {
    const answerSection = document.getElementById('answerSection');
    const correctAnswerDiv = document.getElementById('correctAnswer');
    const explanationText = document.getElementById('explanationText');
    
    const question = questions[currentQuestionIndex];
    const shuffled = shuffledOptions[question.id];
    
    // 回答済みの問題の場合のみ正解を表示
    if (userAnswers[question.id] !== undefined && shuffled && shuffled.correctAnswerIndex !== null) {
        answerSection.style.display = 'block';
        const correctOption = shuffled.shuffledOptions[shuffled.correctAnswerIndex];
        correctAnswerDiv.textContent = `正解: ${shuffled.correctAnswerIndex + 1}. ${correctOption}`;
        
        if (question.explanation) {
            // 解説文内の選択肢番号をシャッフル後の番号に置き換え
            const adjustedExplanation = replaceOptionNumbersInExplanation(question.explanation, shuffled);
            explanationText.textContent = adjustedExplanation;
            document.getElementById('explanationContainer').style.display = 'block';
        } else {
            document.getElementById('explanationContainer').style.display = 'none';
        }
    } else {
        answerSection.style.display = 'none';
    }
}

// 正解をハイライト（回答済みの問題のみ）
function highlightCorrectAnswer() {
    const question = questions[currentQuestionIndex];
    const shuffled = shuffledOptions[question.id];
    
    // 回答済みの問題の場合のみハイライト
    if (!question || !shuffled || shuffled.correctAnswerIndex === null || userAnswers[question.id] === undefined) {
        return;
    }
    
    const options = document.querySelectorAll('.option');
    options.forEach((opt, idx) => {
        // 既に選択時に設定されたcorrect/incorrectクラスは保持
        if (idx === shuffled.correctAnswerIndex && !opt.classList.contains('correct')) {
            opt.classList.add('correct');
        }
    });
}

// 正解率を計算
function calculateAccuracy() {
    let correctCount = 0;
    let answeredCount = 0;
    
    questions.forEach(question => {
        const userAnswer = userAnswers[question.id];
        if (userAnswer !== undefined) {
            answeredCount++;
            const shuffled = shuffledOptions[question.id];
            if (shuffled && shuffled.correctAnswerIndex !== null) {
                if (userAnswer === shuffled.correctAnswerIndex) {
                    correctCount++;
                }
            }
        }
    });
    
    // 正解率 = 正解数 / 総問題数
    const accuracy = questions.length > 0 ? (correctCount / questions.length) * 100 : 0;
    
    return {
        correctCount,
        answeredCount,
        totalCount: questions.length,
        accuracy: Math.round(accuracy * 10) / 10 // 小数点第1位まで
    };
}

function getMistakeQuestionIds() {
    const mistakeIds = [];
    questions.forEach((question) => {
        const id = question.id;
        const userAnswer = userAnswers[id];
        const isSkipped = skippedQuestions.has(id);

        // 未回答・スキップはすべて「間違い」
        if (userAnswer === undefined || isSkipped) {
            mistakeIds.push(id);
            return;
        }

        const shuffled = shuffledOptions[id];
        if (!shuffled || shuffled.correctAnswerIndex === null) return;

        if (userAnswer !== shuffled.correctAnswerIndex) mistakeIds.push(id);
    });
    return mistakeIds;
}

function getMistakeQuestionsForOutput() {
    const ids = getMistakeQuestionIds();
    return ids.map((id) => questionById.get(id)).filter(Boolean);
}

// 間違えた問題の一覧を取得（問題文・正解・解説付き）
function getWrongAnsweredQuestions() {
    const wrongList = [];
    const mistakeQuestions = getMistakeQuestionsForOutput();
    mistakeQuestions.forEach(question => {
        const shuffled = getShuffledOptions(question);
        if (!shuffled || shuffled.correctAnswerIndex === null) return;

        const correctOption = shuffled.shuffledOptions[shuffled.correctAnswerIndex];
        const adjustedExplanation = question.explanation
            ? replaceOptionNumbersInExplanation(question.explanation, shuffled)
            : '';

        const userAnswer = userAnswers[question.id];
        const isSkipped = skippedQuestions.has(question.id);
        let status = 'unanswered';
        if (isSkipped) status = 'skipped';
        if (userAnswer !== undefined && userAnswer !== shuffled.correctAnswerIndex) status = 'incorrect';

        wrongList.push({
            id: question.id,
            question: question.question,
            correctAnswer: correctOption,
            explanation: adjustedExplanation,
            status
        });
    });
    return wrongList;
}

// 間違えた問題をテキストファイルでダウンロード
function downloadWrongAnswersAsText() {
    const wrongList = getWrongAnsweredQuestions();
    if (wrongList.length === 0) return;

    let content = '■ 間違えた問題一覧（問題文・解答解説）\n';
    content += `ダウンロード日時: ${new Date().toLocaleString('ja-JP')}\n`;
    content += `対象: ${wrongList.length} 問\n`;
    content += '―'.repeat(50) + '\n\n';

    wrongList.forEach((item, index) => {
        content += `【問題 ${item.id}】\n\n`;
        content += `問題文:\n${item.question}\n\n`;
        content += `状態: ${item.status === 'incorrect' ? '不正解' : item.status === 'skipped' ? 'スキップ' : '未回答'}\n\n`;
        content += `正解: ${item.correctAnswer}\n\n`;
        if (item.explanation) {
            content += `解説:\n${item.explanation}\n\n`;
        } else {
            content += '解説: （なし）\n\n';
        }
        content += '―'.repeat(50) + '\n\n';
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `間違えた問題_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 結果モーダルを表示
function showResultModal() {
    const result = calculateAccuracy();
    const modal = document.getElementById('resultModal');

    document.getElementById('correctCount').textContent = `${result.correctCount}問`;
    document.getElementById('answeredCount').textContent = `${result.answeredCount}問 / ${result.totalCount}問`;
    document.getElementById('accuracyRate').textContent = `${result.accuracy}%`;

    // 間違え（未回答/スキップ/不正解）ボタン群の表示制御
    const mistakeIds = getMistakeQuestionIds();
    const wrongList = getWrongAnsweredQuestions();
    const downloadWrongButton = document.getElementById('downloadWrongButton');
    if (mistakeIds.length > 0) {
        downloadWrongButton.style.display = 'inline-block';
        downloadWrongButton.textContent = `間違えた問題をダウンロード（${mistakeIds.length}問）`;
    } else {
        downloadWrongButton.style.display = 'none';
    }

    const reviewWrongButton = document.getElementById('reviewWrongButton');
    if (reviewWrongButton) {
        if (mistakeIds.length > 0) {
            reviewWrongButton.style.display = 'inline-block';
            reviewWrongButton.textContent =
                mode === 'review'
                    ? `間違いだけでもう一度試験（${mistakeIds.length}問）`
                    : `間違えた問題だけでもう一度試験（${mistakeIds.length}問）`;
            reviewWrongButton.disabled = false;
        } else {
            reviewWrongButton.style.display = 'none';
        }
    }

    // メッセージを設定
    const messageDiv = document.getElementById('resultMessage');
    let message = '';
    if (result.answeredCount === 0) {
        message = 'まだ回答がありません。問題に答えてください。';
    } else if (mode === 'review' && mistakeIds.length === 0) {
        message = '満点です！復習は完了しました。';
    } else if (result.accuracy >= 80) {
        message = '素晴らしい成績です！合格ラインに達しています。';
    } else if (result.accuracy >= 60) {
        message = '良い成績です。もう少し頑張りましょう！';
    } else {
        message = 'もう一度復習して、理解を深めましょう。';
    }
    messageDiv.textContent = message;

    modal.style.display = 'flex';
    saveStateToStorage();
}

// 結果モーダルを閉じる
function closeResultModal() {
    const modal = document.getElementById('resultModal');
    modal.style.display = 'none';
}

// 再試験を開始（すべての状態をリセット）
function restartExam() {
    // すべての回答をクリア
    userAnswers = {};

    // スキップした問題をクリア
    skippedQuestions.clear();

    // シャッフルされた選択肢をクリア（次回表示時に再シャッフルされる）
    shuffledOptions = {};

    // 初回の表示順設定に従って並び替え
    if (orderPreference === 'random') {
        questions = shuffleArray(questions);
    } else if (orderPreference === 'sequential') {
        questions = [...questions].sort((a, b) => a.id - b.id);
    }

    // 現在の問題インデックスを最初に戻す
    currentQuestionIndex = 0;
    
    // 結果表示ボタンを非表示
    document.getElementById('showResultButton').style.display = 'none';
    
    // 結果モーダルを閉じる
    closeResultModal();
    
    // 最初の問題を表示
    displayQuestion(0);
    
    // 問題一覧を更新
    updateQuestionGrid();
    
    // ページの先頭にスクロール
    window.scrollTo({ top: 0, behavior: 'smooth' });

    saveStateToStorage();
}

// イベントリスナーを設定
function setupEventListeners() {
    if (eventListenersInitialized) return;
    eventListenersInitialized = true;

    document.getElementById('prevButton').addEventListener('click', goToPreviousQuestion);
    document.getElementById('nextButton').addEventListener('click', goToNextQuestion);
    document.getElementById('skipButton').addEventListener('click', skipCurrentQuestion);
    document.getElementById('showResultButton').addEventListener('click', showResultModal);
    document.getElementById('downloadWrongButton').addEventListener('click', downloadWrongAnswersAsText);
    const reviewWrongButton = document.getElementById('reviewWrongButton');
    if (reviewWrongButton) {
        reviewWrongButton.addEventListener('click', () => {
            const ids = getMistakeQuestionIds();
            closeResultModal();
            startReviewExamWithOrderChoice(ids);
        });
    }

    const backToNormalButton = document.getElementById('backToNormalButton');
    if (backToNormalButton) {
        backToNormalButton.addEventListener('click', switchToNormalMode);
    }

    const backToStartButton = document.getElementById('backToStartButton');
    if (backToStartButton) {
        backToStartButton.addEventListener('click', backToStartOrderChoice);
    }

    const importWrongTextButton = document.getElementById('importWrongTextButton');
    if (importWrongTextButton) {
        importWrongTextButton.addEventListener('click', () => {
            openImportReviewModal();
        });
    }

    const importReviewCancelButton = document.getElementById('importReviewCancelButton');
    if (importReviewCancelButton) {
        importReviewCancelButton.addEventListener('click', closeImportReviewModal);
    }

    const importReviewStartButton = document.getElementById('importReviewStartButton');
    if (importReviewStartButton) {
        importReviewStartButton.addEventListener('click', () => {
            const textarea = document.getElementById('importReviewText');
            const text = textarea ? textarea.value : '';
            const ids = parseQuestionIdsFromText(text).filter((id) => questionById.has(id));

            if (ids.length === 0) {
                alert('問題番号が見つかりませんでした。\n「間違えた問題をダウンロード」で出力したテキストを貼り付けてください。');
                return;
            }

            closeImportReviewModal();
            closeResultModal();
            startReviewExamWithOrderChoice(ids);
        });
    }

    const importReviewFile = document.getElementById('importReviewFile');
    if (importReviewFile) {
        importReviewFile.addEventListener('change', (e) => {
            const file = e.target && e.target.files ? e.target.files[0] : null;
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                const textarea = document.getElementById('importReviewText');
                if (textarea) textarea.value = String(reader.result || '');
            };
            reader.onerror = () => {
                alert('ファイルの読み込みに失敗しました。別のファイルを選択してください。');
            };
            reader.readAsText(file, 'utf-8');
        });
    }

    document.getElementById('restartButton').addEventListener('click', restartExam);
    document.getElementById('closeModalButton').addEventListener('click', closeResultModal);
    
    // モーダルの背景をクリックしても閉じる
    document.getElementById('resultModal').addEventListener('click', (e) => {
        if (e.target.id === 'resultModal') {
            closeResultModal();
        }
    });

    const importReviewModal = document.getElementById('importReviewModal');
    if (importReviewModal) {
        importReviewModal.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'importReviewModal') closeImportReviewModal();
        });
    }
    
    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' && currentQuestionIndex > 0) {
            goToPreviousQuestion();
        } else if (e.key === 'ArrowRight' && currentQuestionIndex < questions.length - 1) {
            goToNextQuestion();
        } else if (e.key >= '1' && e.key <= '4') {
            const optionIndex = parseInt(e.key) - 1;
            selectOption(questions[currentQuestionIndex].id, optionIndex);
        } else if (e.key === 'Escape') {
            closeResultModal();
        } else if (e.key === 's' || e.key === 'S') {
            skipCurrentQuestion();
        }
    });
}

// アプリを起動
loadQuestions();
